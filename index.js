import {parse, visit, Kind} from 'graphql';

export class CostExceededError extends Error {
	constructor(cost, maxCost) {
		super(`Query cost ${cost} exceeds maximum allowed cost ${maxCost}`);
		this.name = 'CostExceededError';
		this.cost = cost;
		this.maxCost = maxCost;
	}
}

export class DepthExceededError extends Error {
	constructor(depth, maxDepth) {
		super(`Query depth ${depth} exceeds maximum allowed depth ${maxDepth}`);
		this.name = 'DepthExceededError';
		this.depth = depth;
		this.maxDepth = maxDepth;
	}
}

export default function analyzeCost(query, options = {}) {
	const {
		fieldCosts = {},
		defaultCost = 1,
		depthCostFactor = 1,
		listCostFactor = 10,
		maxCost,
		maxDepth,
	} = options;

	const document = typeof query === 'string' ? parse(query) : query;

	let totalCost = 0;
	let currentDepth = 0;
	let maxObservedDepth = 0;
	const fields = new Map();
	const typeStack = [];

	visit(document, {
		[Kind.OPERATION_DEFINITION]: {
			enter(node) {
				const operationType = node.operation ?? 'Query';
				const typeName = operationType.charAt(0).toUpperCase() + operationType.slice(1);
				typeStack.push(typeName);
			},
			leave() {
				typeStack.pop();
			},
		},
		[Kind.FIELD]: {
			enter(node) {
				const fieldName = node.name.value;
				const parentType = typeStack.at(-1) ?? 'Unknown';
				const qualifiedName = `${parentType}.${fieldName}`;

				const hasListType = node.arguments?.some(
					argument => argument.name.value === 'first' || argument.name.value === 'last' || argument.name.value === 'limit',
				);

				const depthMultiplier = depthCostFactor === 1 ? 1 : depthCostFactor ** currentDepth;
				const baseCost = fieldCosts[qualifiedName] ?? defaultCost;
				const listMultiplier = hasListType ? listCostFactor : 1;
				const fieldCost = baseCost * depthMultiplier * listMultiplier;

				totalCost += fieldCost;

				const currentCount = fields.get(qualifiedName) ?? 0;
				fields.set(qualifiedName, currentCount + fieldCost);

				typeStack.push(fieldName.charAt(0).toUpperCase() + fieldName.slice(1));
			},
			leave() {
				typeStack.pop();
			},
		},
		[Kind.SELECTION_SET]: {
			enter() {
				currentDepth++;

				if (currentDepth > maxObservedDepth) {
					maxObservedDepth = currentDepth;
				}

				if (maxDepth !== undefined && currentDepth > maxDepth) {
					throw new DepthExceededError(currentDepth, maxDepth);
				}
			},
			leave() {
				currentDepth--;
			},
		},
	});

	if (maxCost !== undefined && totalCost > maxCost) {
		throw new CostExceededError(totalCost, maxCost);
	}

	return {
		cost: totalCost,
		depth: maxObservedDepth,
		fields,
	};
}

export function createCostMiddleware(options) {
	return query => analyzeCost(query, options);
}
