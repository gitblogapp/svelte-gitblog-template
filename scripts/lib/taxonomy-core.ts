/** Shared by authoring, translation and the static renderer. No network or file writes. */
export type Taxon = {
	id: string;
	source: string;
	labels: Record<string, string>;
	aliases: string[];
	separate?: boolean;
};
export type Taxonomy = {
	schemaVersion: 1;
	sourceLocale: string;
	tags: Taxon[];
	categories: Taxon[];
};
export type TaxonReference = { id: string; label: string; aliases: string[] };
export type PostTaxonomy = { category: TaxonReference; tags: TaxonReference[] };
export const normalizeTerm = (value: string) =>
	value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
export const termList = (value: unknown): string[] => [
	...new Set(
		(Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
			.filter((v): v is string => typeof v === 'string')
			.map((v) => v.trim().replace(/^#+/, ''))
			.filter(Boolean)
	)
];

export function validateTaxonomy(value: unknown): asserts value is Taxonomy {
	const data = value as Taxonomy;
	if (!data || data.schemaVersion !== 1 || !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(data.sourceLocale))
		throw new Error('Invalid taxonomy schema/sourceLocale');
	for (const kind of ['tags', 'categories'] as const) {
		if (!Array.isArray(data[kind]) || data[kind].length > 10000)
			throw new Error(`Invalid taxonomy ${kind}`);
		const ids = new Set(),
			sources = new Set();
		for (const row of data[kind]) {
			if (!row || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.id) || ids.has(row.id))
				throw new Error('Invalid/duplicate taxonomy ID');
			const validText = (v: unknown): v is string =>
				typeof v === 'string' &&
				!!v.trim() &&
				v.length <= 100 &&
				!Array.from(v).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
			if (!validText(row.source) || sources.has(normalizeTerm(row.source)))
				throw new Error('Invalid/duplicate taxonomy source');
			if (
				!row.labels ||
				typeof row.labels !== 'object' ||
				Array.isArray(row.labels) ||
				Object.keys(row.labels).length > 32 ||
				Object.entries(row.labels).some(
					([k, v]) => !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(k) || !validText(v)
				)
			)
				throw new Error('Invalid taxonomy labels');
			if (
				!Array.isArray(row.aliases) ||
				row.aliases.length > 32 ||
				row.aliases.some((v) => !validText(v)) ||
				(row.separate != null && typeof row.separate !== 'boolean')
			)
				throw new Error('Invalid taxonomy aliases/separate');
			ids.add(row.id);
			sources.add(normalizeTerm(row.source));
		}
	}
}

export function taxonomyGroups(data: Taxonomy, kind: 'tags' | 'categories', locale: string) {
	const groups = new Map<string, Taxon[]>();
	for (const row of data[kind]) {
		// English labels are the only automatic merge key. Never merge by arbitrary aliases.
		const key =
			kind === 'tags' && !row.separate && row.labels.en
				? `en:${normalizeTerm(row.labels.en)}`
				: `id:${row.id}`;
		const group = groups.get(key) ?? [];
		group.push(row);
		groups.set(key, group);
	}
	const result = [...groups.values()].map((rows) => {
		const aliases = [
			...new Set(
				rows
					.flatMap((row) => [row.source, ...Object.values(row.labels), ...row.aliases])
					.map(normalizeTerm)
			)
		];
		if (aliases.length > 128)
			throw new Error('Taxonomy group exceeds 128 aliases; split overly broad groups');
		return {
			id: rows[0].id,
			label: (rows.find((row) => row.labels[locale])?.labels[locale] ?? rows[0].source).trim(),
			aliases,
			members: rows
		};
	});
	// Distinct concepts may have the same display translation. Keep keyed UI labels unique.
	if (kind === 'tags') {
		const collisions = new Set(
			result
				.filter((row) => result.some((other) => row.id !== other.id && row.label === other.label))
				.map((row) => row.label)
		);
		for (const row of result)
			if (collisions.has(row.label))
				row.label = `${row.label.slice(0, 45)} · ${row.members[0].source.slice(0, 45)}`;
	}
	return result;
}

export function resolvePostTaxonomy(
	data: Taxonomy,
	category: string,
	tags: string[],
	locale: string
): PostTaxonomy {
	const index = {
		tags: taxonomyGroups(data, 'tags', locale),
		categories: taxonomyGroups(data, 'categories', locale)
	};
	const resolve = (value: string, kind: 'tags' | 'categories'): TaxonReference => {
		const groups = index[kind];
		// Source and explicit IDs win over aliases. Ambiguous aliases never choose an arbitrary category.
		const exact = groups.find((g) =>
			g.members.some(
				(row) => row.id === value || normalizeTerm(row.source) === normalizeTerm(value)
			)
		);
		const matches = groups.filter((g) => g.aliases.includes(normalizeTerm(value)));
		const group = exact ?? (matches.length === 1 ? matches[0] : undefined);
		return group
			? { id: group.id, label: group.label, aliases: group.aliases }
			: { id: value, label: value, aliases: [normalizeTerm(value)] };
	};
	return {
		category: resolve(category, 'categories'),
		tags: [
			...new Map(
				tags.map((value) => {
					const ref = resolve(value, 'tags');
					return [ref.id, ref] as const;
				})
			).values()
		]
	};
}
