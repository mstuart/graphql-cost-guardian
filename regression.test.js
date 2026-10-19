import test from "ava";
import { parse } from "graphql";
import analyzeCost, { createCostMiddleware } from "./index.js";

test("accepts parsed documents through both public entry points", (t) => {
  const query = "query { users { name } }";
  const document = parse(query);
  const options = { maxCost: 3 };
  t.deepEqual(analyzeCost(document, options), analyzeCost(query, options));
  t.deepEqual(
    createCostMiddleware(options)(document),
    analyzeCost(query, options)
  );
});
