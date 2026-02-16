import test from 'ava';
import analyzeCost, {
	CostExceededError,
	DepthExceededError,
	createCostMiddleware,
} from './index.js';

// Simple query cost

test('calculates cost for a simple query', t => {
	const result = analyzeCost(`
		query {
			user {
				name
				email
			}
		}
	`);

	t.is(result.cost, 3);
});

test('single field query has cost 1', t => {
	const result = analyzeCost('query { version }');
	t.is(result.cost, 1);
});

test('multiple root fields sum costs', t => {
	const result = analyzeCost(`
		query {
			users
			posts
			comments
		}
	`);

	t.is(result.cost, 3);
});

// Depth tracking

test('tracks depth of nested query', t => {
	const result = analyzeCost(`
		query {
			user {
				posts {
					comments {
						author
					}
				}
			}
		}
	`);

	t.is(result.depth, 4);
});

test('flat query has depth 1', t => {
	const result = analyzeCost('query { version }');
	t.is(result.depth, 1);
});

test('depth reflects deepest branch', t => {
	const result = analyzeCost(`
		query {
			user {
				name
				posts {
					title
				}
			}
			version
		}
	`);

	t.true(result.depth >= 3);
});

// Field costs overrides

test('applies custom field costs', t => {
	const result = analyzeCost(`
		query {
			users {
				name
			}
		}
	`, {
		fieldCosts: {'Query.users': 10},
	});

	t.is(result.cost, 11);
});

test('uses defaultCost when no fieldCosts match', t => {
	const result = analyzeCost(`
		query {
			user
			post
		}
	`, {
		defaultCost: 5,
	});

	t.is(result.cost, 10);
});

// DepthCostFactor

test('applies depth cost factor', t => {
	const result = analyzeCost(`
		query {
			user {
				name
			}
		}
	`, {
		depthCostFactor: 2,
	});

	t.true(result.cost > 2);
});

// ListCostFactor

test('applies list cost factor for fields with list arguments', t => {
	const result = analyzeCost(`
		query {
			users(first: 10) {
				name
			}
		}
	`, {
		listCostFactor: 10,
	});

	t.true(result.cost >= 10);
});

test('does not apply list factor to fields without list arguments', t => {
	const result = analyzeCost(`
		query {
			user {
				name
			}
		}
	`, {
		listCostFactor: 10,
	});

	t.is(result.cost, 2);
});

// MaxCost throws CostExceededError

test('throws CostExceededError when maxCost exceeded', t => {
	const error = t.throws(() => analyzeCost(`
		query {
			a
			b
			c
			d
			e
		}
	`, {
		maxCost: 3,
	}), {instanceOf: CostExceededError});

	t.is(error.cost, 5);
	t.is(error.maxCost, 3);
	t.is(error.name, 'CostExceededError');
});

test('does not throw when cost equals maxCost', t => {
	t.notThrows(() => analyzeCost(`
		query {
			a
			b
			c
		}
	`, {
		maxCost: 3,
	}));
});

// MaxDepth throws DepthExceededError

test('throws DepthExceededError when maxDepth exceeded', t => {
	const error = t.throws(() => analyzeCost(`
		query {
			user {
				posts {
					comments {
						author
					}
				}
			}
		}
	`, {
		maxDepth: 2,
	}), {instanceOf: DepthExceededError});

	t.truthy(error.depth);
	t.is(error.maxDepth, 2);
	t.is(error.name, 'DepthExceededError');
});

test('does not throw when depth equals maxDepth', t => {
	t.notThrows(() => analyzeCost(`
		query {
			user {
				name
			}
		}
	`, {
		maxDepth: 2,
	}));
});

// Fields map

test('fields map contains qualified field names', t => {
	const result = analyzeCost(`
		query {
			user {
				name
				email
			}
		}
	`);

	t.true(result.fields instanceof Map);
	t.true(result.fields.has('Query.user'));
});

test('fields map aggregates costs', t => {
	const result = analyzeCost(`
		query {
			a
			b
		}
	`);

	t.is(result.fields.size, 2);
});

// CostExceededError properties

test('CostExceededError has correct properties', t => {
	const error = new CostExceededError(150, 100);
	t.true(error instanceof Error);
	t.is(error.cost, 150);
	t.is(error.maxCost, 100);
	t.is(error.name, 'CostExceededError');
	t.true(error.message.includes('150'));
	t.true(error.message.includes('100'));
});

// DepthExceededError properties

test('DepthExceededError has correct properties', t => {
	const error = new DepthExceededError(6, 5);
	t.true(error instanceof Error);
	t.is(error.depth, 6);
	t.is(error.maxDepth, 5);
	t.is(error.name, 'DepthExceededError');
	t.true(error.message.includes('6'));
	t.true(error.message.includes('5'));
});

// CreateCostMiddleware

test('createCostMiddleware returns a function', t => {
	const middleware = createCostMiddleware({maxCost: 100});
	t.is(typeof middleware, 'function');
});

test('createCostMiddleware function analyzes queries', t => {
	const analyze = createCostMiddleware({defaultCost: 2});
	const result = analyze('query { user { name } }');

	t.is(typeof result.cost, 'number');
	t.is(typeof result.depth, 'number');
	t.true(result.fields instanceof Map);
});

test('createCostMiddleware passes options through', t => {
	const analyze = createCostMiddleware({maxCost: 1});

	t.throws(() => analyze(`
		query {
			a
			b
		}
	`), {instanceOf: CostExceededError});
});

// Edge cases

test('handles query with aliases', t => {
	const result = analyzeCost(`
		query {
			first: user(id: 1) {
				name
			}
			second: user(id: 2) {
				name
			}
		}
	`);

	t.is(result.cost, 4);
});

test('handles mutation operations', t => {
	const result = analyzeCost(`
		mutation {
			createUser(name: "test") {
				id
				name
			}
		}
	`);

	t.is(typeof result.cost, 'number');
	t.true(result.cost > 0);
});

test('returns zero-cost fields map for empty selection', t => {
	const result = analyzeCost('query { version }');
	t.true(result.fields.size > 0);
});

test('handles deeply nested queries', t => {
	const result = analyzeCost(`
		query {
			a {
				b {
					c {
						d {
							e
						}
					}
				}
			}
		}
	`);

	t.is(result.depth, 5);
	t.is(result.cost, 5);
});

test('handles multiple arguments including limit', t => {
	const result = analyzeCost(`
		query {
			users(limit: 50, offset: 0) {
				name
			}
		}
	`, {
		listCostFactor: 5,
	});

	t.true(result.cost >= 5);
});
