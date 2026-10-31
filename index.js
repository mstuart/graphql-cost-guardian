import { Kind, parse } from "graphql";

export class CostExceededError extends Error {
  constructor(cost, maxCost) {
    super(`Query cost ${cost} exceeds maximum allowed cost ${maxCost}`);
    this.name = "CostExceededError";
    this.cost = cost;
    this.maxCost = maxCost;
  }
}

export class DepthExceededError extends Error {
  constructor(depth, maxDepth) {
    super(`Query depth ${depth} exceeds maximum allowed depth ${maxDepth}`);
    this.name = "DepthExceededError";
    this.depth = depth;
    this.maxDepth = maxDepth;
  }
}

function validateOptions({
  defaultCost,
  depthCostFactor,
  listCostFactor,
  fieldCosts,
  maxCost,
  maxDepth,
}) {
  for (const [name, value] of Object.entries({
    defaultCost,
    depthCostFactor,
    listCostFactor,
    ...Object.fromEntries(
      Object.entries(fieldCosts).map(([fieldName, fieldValue]) => [
        `fieldCosts.${fieldName}`,
        fieldValue,
      ])
    ),
  })) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new TypeError(`${name} must be a finite non-negative number`);
    }
  }
  for (const [name, value] of Object.entries({ maxCost, maxDepth })) {
    if (
      value !== undefined &&
      (typeof value !== "number" || Number.isNaN(value) || value < 0)
    ) {
      throw new TypeError(`${name} must be a non-negative number`);
    }
  }
}

function createFrame(selectionSet, parentType, depth, maxDepth, fragmentName) {
  if (maxDepth !== undefined && depth > maxDepth) {
    throw new DepthExceededError(depth, maxDepth);
  }
  return {
    depth,
    fragmentName,
    index: 0,
    parentType,
    result: { children: [], cost: 0, depth, fields: new Map() },
    selections: selectionSet.selections,
  };
}

function mergeResult(target, source) {
  target.cost += source.cost;
  target.depth = Math.max(target.depth, source.depth);
  target.children.push(source);
}

function addField(node, frame, stack, options, fieldOrder) {
  const { fieldCosts, defaultCost, depthCostFactor, listCostFactor, maxDepth } =
    options;
  const fieldName = node.name.value;
  const qualifiedName = `${frame.parentType}.${fieldName}`;
  fieldOrder.add(qualifiedName);
  const hasListType = node.arguments?.some((argument) =>
    ["first", "last", "limit"].includes(argument.name.value)
  );
  const baseCost = fieldCosts[qualifiedName] ?? defaultCost;
  // Validate the actual lookup as well as enumerable configuration entries.
  if (
    typeof baseCost !== "number" ||
    !Number.isFinite(baseCost) ||
    baseCost < 0
  ) {
    throw new TypeError(
      `fieldCosts.${qualifiedName} must be a finite non-negative number`
    );
  }
  const depthMultiplier =
    depthCostFactor === 1 ? 1 : depthCostFactor ** frame.depth;
  const fieldCost =
    baseCost * depthMultiplier * (hasListType ? listCostFactor : 1);
  frame.result.cost += fieldCost;
  frame.result.fields.set(
    qualifiedName,
    (frame.result.fields.get(qualifiedName) ?? 0) + fieldCost
  );
  if (node.selectionSet) {
    const typeName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
    stack.push(
      createFrame(node.selectionSet, typeName, frame.depth + 1, maxDepth)
    );
  }
}

function addFragment(node, frame, stack, context) {
  const { fragments, fragmentCosts, activeFragments, maxDepth } = context;
  const name = node.name.value;
  const fragment = fragments.get(name);
  if (!fragment) {
    throw new Error(`Unknown fragment: ${name}`);
  }
  if (activeFragments.has(name)) {
    throw new Error(`Cyclic fragment: ${name}`);
  }
  const cached = fragmentCosts.get(`${name}:${frame.depth}`);
  if (cached) {
    mergeResult(frame.result, cached);
  } else {
    activeFragments.add(name);
    stack.push(
      createFrame(
        fragment.selectionSet,
        fragment.typeCondition.name.value,
        frame.depth,
        maxDepth,
        name
      )
    );
  }
}

function analyzeOperation(
  operation,
  options,
  fragments,
  fragmentCosts,
  completed,
  fieldOrder
) {
  const { maxDepth } = options;
  const activeFragments = new Set();
  const context = { activeFragments, fragmentCosts, fragments, maxDepth };
  const operationType = operation.operation;
  const rootType =
    operationType.charAt(0).toUpperCase() + operationType.slice(1);
  const result = { children: [], cost: 0, depth: 0, fields: new Map() };
  const stack = [createFrame(operation.selectionSet, rootType, 1, maxDepth)];
  // Explicit frames avoid recursive expansion; memoized fragment summaries are
  // charged at every spread without walking an exponentially expanded document.
  while (stack.length > 0) {
    const frame = stack.at(-1);
    const node = frame.selections[frame.index];
    frame.index += 1;
    if (!node) {
      stack.pop();
      if (frame.fragmentName) {
        activeFragments.delete(frame.fragmentName);
        fragmentCosts.set(`${frame.fragmentName}:${frame.depth}`, frame.result);
      }
      completed.push(frame.result);
      mergeResult(stack.at(-1)?.result ?? result, frame.result);
      continue;
    }
    if (node.kind === Kind.FRAGMENT_SPREAD) {
      addFragment(node, frame, stack, context);
    } else if (node.kind === Kind.INLINE_FRAGMENT) {
      stack.push(
        createFrame(
          node.selectionSet,
          node.typeCondition?.name.value ?? frame.parentType,
          frame.depth,
          maxDepth
        )
      );
    } else {
      addField(node, frame, stack, options, fieldOrder);
    }
  }
  completed.push(result);
  return result;
}

function collectFields(completed, root, fieldOrder) {
  const multiplicities = new Map([[root, 1]]);
  const fields = new Map();
  // Completion order puts dependencies first. Reverse it to propagate each
  // summary's total multiplicity once, including shared diamond dependencies.
  for (const summary of completed.toReversed()) {
    const count = multiplicities.get(summary) ?? 0;
    for (const [name, cost] of summary.fields) {
      const weighted = cost === 0 ? 0 : cost * count;
      fields.set(name, (fields.get(name) ?? 0) + weighted);
    }
    for (const child of summary.children) {
      multiplicities.set(child, (multiplicities.get(child) ?? 0) + count);
    }
  }
  return new Map([...fieldOrder].map((name) => [name, fields.get(name)]));
}

export default function analyzeCost(query, options = {}) {
  const {
    defaultCost = 1,
    depthCostFactor = 1,
    fieldCosts = {},
    listCostFactor = 10,
    maxCost,
    maxDepth,
  } = options;
  const normalized = {
    defaultCost,
    depthCostFactor,
    fieldCosts,
    listCostFactor,
    maxCost,
    maxDepth,
  };
  validateOptions(normalized);
  const document = typeof query === "string" ? parse(query) : query;
  const fragments = new Map(
    document.definitions
      .filter((node) => node.kind === Kind.FRAGMENT_DEFINITION)
      .map((node) => [node.name.value, node])
  );
  const fragmentCosts = new Map();
  const completed = [];
  const fieldOrder = new Set();
  const result = { children: [], cost: 0, depth: 0, fields: new Map() };
  for (const operation of document.definitions) {
    if (operation.kind === Kind.OPERATION_DEFINITION) {
      mergeResult(
        result,
        analyzeOperation(
          operation,
          normalized,
          fragments,
          fragmentCosts,
          completed,
          fieldOrder
        )
      );
    }
  }
  if (normalized.maxCost !== undefined && result.cost > normalized.maxCost) {
    throw new CostExceededError(result.cost, normalized.maxCost);
  }
  completed.push(result);
  return {
    cost: result.cost,
    depth: result.depth,
    fields: collectFields(completed, result, fieldOrder),
  };
}

export function createCostMiddleware(options) {
  return (query) => analyzeCost(query, options);
}
