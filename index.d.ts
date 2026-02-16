export type AnalyzeCostOptions = {
	/**
	Mapping of `TypeName.fieldName` to custom cost values.
	@default {}
	*/
	readonly fieldCosts?: Record<string, number>;

	/**
	Default cost per field when not specified in `fieldCosts`.
	@default 1
	*/
	readonly defaultCost?: number;

	/**
	Multiplier applied per nesting depth level.
	@default 1
	*/
	readonly depthCostFactor?: number;

	/**
	Assumed list size multiplier for fields with list arguments.
	@default 10
	*/
	readonly listCostFactor?: number;

	/**
	Maximum allowed cost. Throws `CostExceededError` when exceeded.
	*/
	readonly maxCost?: number;

	/**
	Maximum allowed query depth. Throws `DepthExceededError` when exceeded.
	*/
	readonly maxDepth?: number;
};

export type CostAnalysis = {
	/** Total computed cost of the query. */
	readonly cost: number;

	/** Maximum nesting depth observed. */
	readonly depth: number;

	/** Map of qualified field names to their computed costs. */
	readonly fields: Map<string, number>;
};

/**
Error thrown when query cost exceeds the configured maximum.
*/
export class CostExceededError extends Error {
	readonly cost: number;
	readonly maxCost: number;
	constructor(cost: number, maxCost: number);
}

/**
Error thrown when query depth exceeds the configured maximum.
*/
export class DepthExceededError extends Error {
	readonly depth: number;
	readonly maxDepth: number;
	constructor(depth: number, maxDepth: number);
}

/**
Analyze the cost of a GraphQL query.

@param query - A GraphQL query string or parsed DocumentNode.
@param options - Configuration options for cost analysis.
@returns The cost analysis result.

@example
```
import analyzeCost from 'graphql-cost-guardian';

const result = analyzeCost(`
	query {
		users {
			name
			email
		}
	}
`);

console.log(result.cost);
// => 3
```
*/
export default function analyzeCost(query: string, options?: AnalyzeCostOptions): CostAnalysis;

/**
Create a reusable cost analysis middleware function.

@param options - Configuration options for cost analysis.
@returns A function that analyzes query cost.

@example
```
import {createCostMiddleware} from 'graphql-cost-guardian';

const analyze = createCostMiddleware({maxCost: 100, maxDepth: 5});
const result = analyze('query { users { name } }');
```
*/
export function createCostMiddleware(options: AnalyzeCostOptions): (query: string) => CostAnalysis;
