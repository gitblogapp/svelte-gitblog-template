export interface RelatedPanelConfig {
	repo: string;
	baseUrl: string;
	showThumbnail: boolean;
	limit: number;
}

const disabled = (value?: string) =>
	['false', '0', 'off', 'no'].includes(value?.trim().toLowerCase() ?? '');

export function createRelatedPanelConfig(input: {
	repository: string;
	hubEnabled: boolean;
	enabled?: string;
	showThumbnail?: string;
	limit?: string;
	hubUrl?: string;
}): RelatedPanelConfig | null {
	if (!input.hubEnabled || disabled(input.enabled)) return null;
	if (!/^[a-z0-9-]{1,39}\/[a-z0-9_.-]{1,100}$/i.test(input.repository)) return null;
	try {
		const hub = new URL(input.hubUrl?.trim() || 'https://gitblog.app');
		if (
			hub.protocol !== 'https:' ||
			hub.username ||
			hub.password ||
			hub.search ||
			hub.hash ||
			hub.pathname !== '/'
		)
			return null;
		return {
			repo: input.repository,
			baseUrl: `${hub.origin}/related/v1/`,
			showThumbnail: !disabled(input.showThumbnail),
			limit: /^[1-8]$/.test(input.limit?.trim() ?? '') ? Number(input.limit!.trim()) : 4
		};
	} catch {
		return null;
	}
}
