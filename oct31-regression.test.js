import test from "ava";
import analyzeCost, { CostExceededError } from "./index.js";

test("counts a named fragment for every reachable spread", (t) => {
  const query =
    "{ left: user { ...Fields } right: user { ...Fields } } fragment Fields on User { id }";
  const result = analyzeCost(query);
  t.is(result.cost, 4);
  t.is(result.fields.get("User.id"), 2);
  t.throws(() => analyzeCost(query, { maxCost: 3 }), {
    instanceOf: CostExceededError,
  });
});
test("counts named-fragment depth in its operation context", (t) => {
  const query =
    "{ user { ...Fields } } fragment Fields on User { profile { name } }";
  t.is(analyzeCost(query).depth, 3);
});
test("inline fragment wrappers do not add response nesting depth", (t) => {
  const result = analyzeCost("{ user { ... on User { id } } }", {
    maxDepth: 2,
  });
  t.is(result.depth, 2);
  t.is(result.cost, 2);
});
for (const options of [
  { defaultCost: Number.NaN },
  { depthCostFactor: Number.NaN },
  { listCostFactor: Number.NaN },
  { fieldCosts: { "Query.user": Number.NaN } },
  { maxCost: Number.NaN },
  { maxDepth: Number.NaN },
  { defaultCost: -1 },
  { fieldCosts: Object.create({ "Query.user": Number.NaN }) },
]) {
  test(`rejects invalid numeric configuration ${JSON.stringify(options)}`, (t) => {
    t.throws(() => analyzeCost("{ user { id } }", options), {
      instanceOf: TypeError,
    });
  });
}

test("ignores unused fragments", (t) => {
  const result = analyzeCost(
    "{ id } fragment Unused on User { profile { name } }"
  );
  t.is(result.cost, 1);
  t.is(result.depth, 1);
});

test("keeps fragment summaries separate at different depths", (t) => {
  const result = analyzeCost(
    "{ ...Fields user { ...Fields } } fragment Fields on User { id }",
    {
      depthCostFactor: 2,
      fieldCosts: { "User.id": 3 },
    }
  );
  t.is(result.cost, 20);
  t.is(result.depth, 2);
  t.is(result.fields.get("User.id"), 18);
});

test("charges a diamond of fragment spreads without expanding every path", (t) => {
  const fragments = ["fragment F0 on User { id }"];
  for (let level = 1; level <= 35; level += 1) {
    fragments.push(
      `fragment F${level} on User { ...F${level - 1} ...F${level - 1} }`
    );
  }
  const result = analyzeCost(`{ user { ...F35 } } ${fragments.join(" ")}`);
  t.is(result.cost, 1 + 2 ** 35);
  t.is(result.fields.get("User.id"), 2 ** 35);
  t.is(result.depth, 2);
});

test("rejects cyclic and missing fragments", (t) => {
  t.throws(
    () => analyzeCost("{ ...A } fragment A on Query { user { ...A } }"),
    {
      message: "Cyclic fragment: A",
    }
  );
  t.throws(() => analyzeCost("{ ...Missing }"), {
    message: "Unknown fragment: Missing",
  });
});

test("accepts zero costs and explicit unbounded limits", (t) => {
  const result = analyzeCost("{ user(first: 1) { id } }", {
    defaultCost: 0,
    maxCost: Number.POSITIVE_INFINITY,
    maxDepth: Number.POSITIVE_INFINITY,
  });
  t.is(result.cost, 0);
  t.is(result.depth, 2);
});
