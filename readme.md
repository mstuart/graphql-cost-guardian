# graphql-cost-guardian

> Analyze and limit the cost of GraphQL queries using configurable field costs

## Install

```sh
npm install graphql-cost-guardian graphql
```

## Usage

```js
import analyzeCost from 'graphql-cost-guardian';

const result = analyzeCost(`
	query {
		users {
			name
			posts {
				title
				comments {
					body
				}
			}
		}
	}
`, {
	fieldCosts: {'Query.users': 10},
	maxCost: 100,
	maxDepth: 5,
});

console.log(result.cost);
// => 14

console.log(result.depth);
// => 4
```

### Middleware

```js
import {createCostMiddleware} from 'graphql-cost-guardian';

const analyze = createCostMiddleware({
	maxCost: 500,
	maxDepth: 10,
	defaultCost: 1,
	listCostFactor: 10,
});

// Use in your GraphQL server middleware
const result = analyze(incomingQuery);
```

## API

### `analyzeCost(query, options?)`

Analyze the cost of a GraphQL query.

#### query

Type: `string`

A GraphQL query string.

#### options

Type: `object`

##### fieldCosts

Type: `Record<string, number>`\
Default: `{}`

Mapping of `TypeName.fieldName` to custom cost values.

##### defaultCost

Type: `number`\
Default: `1`

Default cost per field when not specified in `fieldCosts`.

##### depthCostFactor

Type: `number`\
Default: `1`

Multiplier applied per nesting depth level.

##### listCostFactor

Type: `number`\
Default: `10`

Assumed list size multiplier for fields with list-related arguments (`first`, `last`, `limit`).

##### maxCost

Type: `number`

Maximum allowed cost. Throws `CostExceededError` when exceeded.

##### maxDepth

Type: `number`

Maximum allowed query depth. Throws `DepthExceededError` when exceeded.

#### Return value

Type: `{cost: number, depth: number, fields: Map<string, number>}`

### `createCostMiddleware(options)`

Returns a function `(query) => CostAnalysis` with the given options baked in.

### `CostExceededError`

Thrown when query cost exceeds `maxCost`. Has `cost` and `maxCost` properties.

### `DepthExceededError`

Thrown when query depth exceeds `maxDepth`. Has `depth` and `maxDepth` properties.

## Related

- [graphql](https://github.com/graphql/graphql-js) — The JavaScript reference implementation for GraphQL

## License

MIT
