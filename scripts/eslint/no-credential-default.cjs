// @ts-check
// Rejects a credential read from the environment with a hard-coded fallback, such as
// `process.env['NUXEO_PASSWORD'] ?? 'Administrator'`: an unset variable must stop the code,
// not sign it in as a default account. Credential-shaped values have no token pattern a
// secret scanner can recognise, so the read itself is checked. An empty-string fallback
// is allowed. Not seen: values reached through calls, imports or a renamed `env` object.

/** Bare USER and LOGIN are the operating system's own variables, so they need a prefix. */
const CREDENTIAL =
	/(^|_)(PASS|PASSWD|PASSWORD|TOKEN|SECRET|AUTH|API_?KEY)$|_(USER|USERNAME|LOGIN)$/i;

/** @param {any} node */
const unwrap = (node) => {
	while (
		node &&
		['TSNonNullExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'ChainExpression'].includes(
			node.type,
		)
	)
		node = node.expression;
	return node;
};

/** @param {any} node */
const isProcessEnv = (node) => {
	node = unwrap(node);
	return (
		node?.type === 'MemberExpression' &&
		node.object.type === 'Identifier' &&
		node.object.name === 'process' &&
		propertyName(node) === 'env'
	);
};

/** @param {any} node */
function propertyName(node) {
	if (!node.computed && node.property.type === 'Identifier') return node.property.name;
	if (node.property.type === 'Literal' && typeof node.property.value === 'string')
		return node.property.value;
	return undefined;
}

/** The credential variable `node` reads from process.env, if any. @param {any} node */
const credentialRead = (node) => {
	node = unwrap(node);
	if (node?.type !== 'MemberExpression' || !isProcessEnv(node.object)) return undefined;
	const name = propertyName(node);
	return name && CREDENTIAL.test(name) ? name : undefined;
};

/** Every credential read in a `??` / `||` chain such as `env.A ?? env.B`. @param {any} node */
const chainReads = (node) => {
	node = unwrap(node);
	if (node?.type === 'LogicalExpression' && ['??', '||'].includes(node.operator))
		return [...chainReads(node.left), ...chainReads(node.right)];
	const name = credentialRead(node);
	return name ? [name] : [];
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Never fall back to a hard-coded credential when an env variable is unset.',
		},
		schema: [],
		messages: {
			fallback:
				"'{{name}}' falls back to a hard-coded value. Require the variable and fail when it is unset.",
		},
	},
	create(context) {
		/** A non-empty string, directly or through a same-file `const`. @param {any} node */
		const isLiteralFallback = (node, depth = 0) => {
			node = unwrap(node);
			if (node?.type === 'Literal') return typeof node.value === 'string' && node.value !== '';
			if (node?.type === 'TemplateLiteral')
				return node.expressions.length === 0 && node.quasis[0].value.cooked !== '';
			if (node?.type !== 'Identifier' || depth > 3) return false;
			for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
				const variable = scope.set.get(node.name);
				if (!variable) continue;
				const definition = variable.defs[0];
				return (
					variable.defs.length === 1 &&
					definition.type === 'Variable' &&
					definition.parent.kind === 'const' &&
					isLiteralFallback(definition.node.init, depth + 1)
				);
			}
			return false;
		};

		/** @param {any} node @param {string} name */
		const report = (node, name) => context.report({ node, messageId: 'fallback', data: { name } });

		return {
			/** @param {any} node */
			LogicalExpression(node) {
				if (!['??', '||'].includes(node.operator) || !isLiteralFallback(node.right)) return;
				const [name] = chainReads(node.left);
				if (name) report(node.right, name);
			},
			/** @param {any} node */
			AssignmentExpression(node) {
				if (!['??=', '||='].includes(node.operator)) return;
				const name = credentialRead(node.left);
				if (name && isLiteralFallback(node.right)) report(node.right, name);
			},
			/** `env.X ? env.X : 'x'` and `!env.X ? 'x' : env.X`. @param {any} node */
			ConditionalExpression(node) {
				for (const [read, fallback] of [
					[node.consequent, node.alternate],
					[node.alternate, node.consequent],
				]) {
					const name = credentialRead(read);
					if (name && isLiteralFallback(fallback)) report(fallback, name);
				}
			},
			/** `const { NUXEO_PASSWORD = 'x' } = process.env`. @param {any} node */
			AssignmentPattern(node) {
				const property = node.parent;
				const pattern = property?.parent;
				if (property?.type !== 'Property' || pattern?.type !== 'ObjectPattern') return;
				const source =
					pattern.parent?.type === 'VariableDeclarator'
						? pattern.parent.init
						: pattern.parent?.right;
				if (!isProcessEnv(source)) return;
				const name =
					property.key.type === 'Identifier' ? property.key.name : String(property.key.value ?? '');
				if (CREDENTIAL.test(name) && isLiteralFallback(node.right)) report(node.right, name);
			},
		};
	},
};
