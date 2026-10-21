// Player controls follow the page locale, independently of the speech model's languages.
const labels: Record<string, readonly string[]> = {
	en: [
		'AI narration',
		'Listen to this article',
		'Play',
		'Pause',
		'Audio position',
		'Playback speed',
		'Loading audio…',
		'Unable to load audio. Press play to try again.'
	],
	ko: [
		'AI 음성',
		'이 글을 음성으로 듣기',
		'재생',
		'일시정지',
		'재생 위치',
		'재생 속도',
		'음성을 불러오는 중…',
		'음성을 불러오지 못했습니다. 재생 버튼으로 다시 시도해 주세요.'
	],
	ja: [
		'AI音声',
		'この記事を聴く',
		'再生',
		'一時停止',
		'再生位置',
		'再生速度',
		'音声を読み込み中…',
		'音声を読み込めませんでした。再生ボタンで再試行してください。'
	],
	de: [
		'KI-Erzählung',
		'Diesen Artikel anhören',
		'Abspielen',
		'Pause',
		'Audioposition',
		'Wiedergabegeschwindigkeit',
		'Audio wird geladen…',
		'Audio konnte nicht geladen werden. Drücke auf Wiedergabe, um es erneut zu versuchen.'
	],
	es: [
		'Narración con IA',
		'Escuchar este artículo',
		'Reproducir',
		'Pausar',
		'Posición del audio',
		'Velocidad de reproducción',
		'Cargando audio…',
		'No se pudo cargar el audio. Pulsa reproducir para reintentarlo.'
	],
	fr: [
		'Narration par IA',
		'Écouter cet article',
		'Lire',
		'Pause',
		'Position audio',
		'Vitesse de lecture',
		'Chargement audio…',
		'Impossible de charger l’audio. Appuyez sur lecture pour réessayer.'
	],
	it: [
		'Narrazione IA',
		'Ascolta questo articolo',
		'Riproduci',
		'Pausa',
		'Posizione audio',
		'Velocità di riproduzione',
		'Caricamento audio…',
		'Impossibile caricare l’audio. Premi Riproduci per riprovare.'
	],
	pt: [
		'Narração por IA',
		'Ouvir este artigo',
		'Reproduzir',
		'Pausar',
		'Posição do áudio',
		'Velocidade de reprodução',
		'A carregar áudio…',
		'Não foi possível carregar o áudio. Prima reproduzir para tentar novamente.'
	],
	'pt-br': [
		'Narração por IA',
		'Ouvir este artigo',
		'Reproduzir',
		'Pausar',
		'Posição do áudio',
		'Velocidade de reprodução',
		'Carregando áudio…',
		'Não foi possível carregar o áudio. Toque em reproduzir para tentar novamente.'
	],
	ar: [
		'سرد بالذكاء الاصطناعي',
		'استمع إلى هذا المقال',
		'تشغيل',
		'إيقاف مؤقت',
		'موضع الصوت',
		'سرعة التشغيل',
		'جارٍ تحميل الصوت…',
		'تعذّر تحميل الصوت. اضغط على تشغيل للمحاولة مجددًا.'
	],
	'zh-hans': [
		'AI 朗读',
		'收听本文',
		'播放',
		'暂停',
		'播放位置',
		'播放速度',
		'正在加载音频…',
		'无法加载音频。请点击播放重试。'
	],
	'zh-hant': [
		'AI 朗讀',
		'收聽本文',
		'播放',
		'暫停',
		'播放位置',
		'播放速度',
		'正在載入音訊…',
		'無法載入音訊。請點擊播放重試。'
	]
};
export function audioCopy(locale: string) {
	const normalized = locale.toLowerCase().replaceAll('_', '-');
	const [eyebrow, title, play, pause, position, speed, loading, error] =
		labels[normalized] ??
		labels[normalized.split('-')[0]] ??
		(normalized === 'zh' ? labels['zh-hans'] : labels.en);
	return { eyebrow, title, play, pause, position, speed, loading, error };
}
export function audioTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return '–:––';
	const total = Math.floor(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	return `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : minutes}:${String(total % 60).padStart(2, '0')}`;
}
