import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js';

export const LOCALES = ['en-US', 'es', 'fr', 'ar', 'ro', 'pt-PT', 'it'];
export function flattenCatalogue(value, prefix = '', result = {}) {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`Invalid catalogue object at ${prefix || '<root>'}`);
	for (const [key, item] of Object.entries(value)) {
		const name = prefix ? `${prefix}.${key}` : key;
		if (['__proto__', 'prototype', 'constructor'].includes(key))
			throw new Error(`Unsafe message key ${name}`);
		if (typeof item === 'string') {
			if (Object.hasOwn(result, name)) throw new Error(`Duplicate flattened message key ${name}`);
			result[name] = item;
		} else flattenCatalogue(item, name, result);
	}
	return result;
}

// Reads a static generated object without executing application modules or client code.
export function readPolymerCatalogue(filename) {
	const source = ts.createSourceFile(
		filename,
		fs.readFileSync(filename, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
	);
	let initializer;
	const visit = (node) => {
		if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'POLYMER_MESSAGES')
			initializer = node.initializer;
		ts.forEachChild(node, visit);
	};
	visit(source);
	const literal = (node) => {
		if (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)))
			return literal(node.expression);
		if (node && ts.isStringLiteralLike(node)) return node.text;
		if (!node || !ts.isObjectLiteralExpression(node))
			throw new Error('POLYMER_MESSAGES must be a static generated string catalogue.');
		const object = Object.create(null);
		for (const property of node.properties) {
			if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name))
				throw new Error('Unsupported generated catalogue property.');
			const key = ts.isIdentifier(property.name) ? property.name.text : property.name.text;
			if (Object.hasOwn(object, key)) throw new Error(`Duplicate generated message key ${key}`);
			object[key] = literal(property.initializer);
		}
		return object;
	};
	return literal(initializer);
}

export function loadProductionCatalogues(root) {
	const sdk = readPolymerCatalogue(path.join(root, 'app/extensions/polymer-messages.generated.ts'));
	const catalogues = {},
		layers = {},
		errors = [];
	for (const locale of LOCALES) {
		const filename = path.join(root, 'assets/i18n', `${locale}.json`);
		let legacy = {};
		if (!fs.existsSync(filename)) errors.push(`${locale}: missing legacy catalogue file`);
		else {
			try {
				legacy = flattenCatalogue(JSON.parse(fs.readFileSync(filename, 'utf8')));
			} catch (error) {
				errors.push(`${locale}: ${error.message}`);
			}
		}
		if (!sdk[locale]) errors.push(`${locale}: missing SDK catalogue layer`);
		layers[locale] = { legacy, sdk: sdk[locale] ?? {} };
		catalogues[locale] = { ...layers[locale].sdk, ...legacy };
	}
	return { catalogues, layers, errors };
}

export function messageContract(message, locale) {
	const ast = parse(message, { ignoreTag: true, requiresOtherClause: true });
	const args = new Map(),
		selectors = [];
	const visit = (items) => {
		for (const item of items) {
			if (
				[TYPE.argument, TYPE.number, TYPE.date, TYPE.time, TYPE.select, TYPE.plural].includes(
					item.type,
				)
			) {
				const types = args.get(item.value) ?? new Set();
				types.add(item.type === TYPE.plural ? `plural:${item.pluralType}` : String(item.type));
				args.set(item.value, types);
			}
			if (item.type === TYPE.select || item.type === TYPE.plural) {
				const keys = Object.keys(item.options);
				if (item.type === TYPE.plural) {
					const required = new Intl.PluralRules(locale, { type: item.pluralType }).resolvedOptions()
						.pluralCategories;
					const absent = required.filter(
						(key) =>
							!keys.includes(key) &&
							!(
								key === 'one' &&
								['en-US', 'es', 'it', 'pt-PT'].includes(locale) &&
								keys.includes('=1')
							),
					);
					if (absent.length)
						throw new Error(`plural ${item.value} lacks locale categories: ${absent.join(', ')}`);
				}
				selectors.push({
					name: item.value,
					type: item.type,
					keys:
						item.type === TYPE.select
							? keys.sort()
							: keys.filter((key) => key.startsWith('=')).sort(),
					offset: item.offset ?? 0,
				});
				for (const option of Object.values(item.options)) visit(option.value);
			}
		}
	};
	visit(ast);
	return {
		arguments: Object.fromEntries(
			[...args]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, types]) => [key, [...types].sort()]),
		),
		selectors,
	};
}

export function validateCatalogues(catalogues) {
	const errors = [];
	const english = catalogues['en-US'];
	if (!english || !Object.keys(english).length) return ['English catalogue is empty or absent.'];
	const baseContracts = new Map();
	for (const [key, text] of Object.entries(english)) {
		try {
			if (typeof text !== 'string' || !text.trim()) throw new Error('empty/non-string message');
			baseContracts.set(key, messageContract(text, 'en-US'));
		} catch (error) {
			errors.push(`en-US:${key}: ${error.message}`);
		}
	}
	for (const locale of LOCALES) {
		const entries = catalogues[locale];
		if (!entries) {
			errors.push(`${locale}: absent catalogue`);
			continue;
		}
		for (const key of Object.keys(english))
			if (!Object.hasOwn(entries, key)) errors.push(`${locale}:${key}: missing translation`);
		for (const [key, text] of Object.entries(entries)) {
			if (!Object.hasOwn(english, key)) {
				errors.push(`${locale}:${key}: unknown extra key`);
				continue;
			}
			try {
				if (typeof text !== 'string' || !text.trim()) throw new Error('empty/non-string message');
				const contract = messageContract(text, locale),
					base = baseContracts.get(key);
				if (base && JSON.stringify(contract.arguments) !== JSON.stringify(base.arguments))
					throw new Error('argument names/types differ from English');
				if (base)
					for (const selector of base.selectors) {
						const matching = contract.selectors.find(
							(other) =>
								other.name === selector.name &&
								other.type === selector.type &&
								other.offset === selector.offset,
						);
						if (!matching || selector.keys.some((key) => !matching.keys.includes(key)))
							throw new Error(`selector ${selector.name} lost a required branch or offset`);
					}
			} catch (error) {
				errors.push(`${locale}:${key}: ${error.message}`);
			}
		}
	}
	return errors;
}

const ACCENTS = { a: 'á', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Á', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' };
export function pseudoMessage(message) {
	const ast = parse(message, { ignoreTag: true, requiresOtherClause: true });
	const visit = (nodes) =>
		nodes.map((node) => {
			if (node.type === TYPE.literal) {
				const value = node.value
					.split(/(<[^>]*>)/g)
					.map((part, index) =>
						index % 2 ? part : [...part].map((char) => ACCENTS[char] ?? char).join(''),
					)
					.join('');
				return {
					...node,
					value: node.value.trim()
						? `⟦${value}${'·'.repeat(Math.ceil(node.value.replace(/<[^>]*>/g, '').length * 0.3))}⟧`
						: value,
				};
			}
			if (node.options)
				return {
					...node,
					options: Object.fromEntries(
						Object.entries(node.options).map(([key, option]) => [
							key,
							{ ...option, value: visit(option.value) },
						]),
					),
				};
			return node;
		});
	return printAST(visit(ast));
}
