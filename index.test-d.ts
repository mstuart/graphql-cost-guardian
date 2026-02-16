import {expectType, expectError} from 'tsd';
import analyzeCost, {
	createCostMiddleware,
	CostExceededError,
	DepthExceededError,
	type CostAnalysis,
} from './index.js';

// AnalyzeCost returns CostAnalysis
const result = analyzeCost('query { users { name } }');
expectType<CostAnalysis>(result);
expectType<number>(result.cost);
expectType<number>(result.depth);
expectType<Map<string, number>>(result.fields);

// AnalyzeCost with options
const resultWithOptions = analyzeCost('query { users { name } }', {
	fieldCosts: {'Query.users': 10},
	defaultCost: 2,
	depthCostFactor: 1.5,
	listCostFactor: 20,
	maxCost: 100,
	maxDepth: 5,
});
expectType<CostAnalysis>(resultWithOptions);

// CostExceededError
const costError = new CostExceededError(150, 100);
expectType<CostExceededError>(costError);
expectType<number>(costError.cost);
expectType<number>(costError.maxCost);
const costAsError: Error = costError;
expectType<Error>(costAsError);

// DepthExceededError
const depthError = new DepthExceededError(6, 5);
expectType<DepthExceededError>(depthError);
expectType<number>(depthError.depth);
expectType<number>(depthError.maxDepth);
const depthAsError: Error = depthError;
expectType<Error>(depthAsError);

// CreateCostMiddleware
const middleware = createCostMiddleware({maxCost: 100});
expectType<(query: string) => CostAnalysis>(middleware);
const middlewareResult = middleware('query { users { name } }');
expectType<CostAnalysis>(middlewareResult);

// AnalyzeCost requires query argument
expectError(analyzeCost());
