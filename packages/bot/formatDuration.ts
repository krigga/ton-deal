const formatPlural = (n: number, word: string) => `${n} ${word}${n % 10 === 1 ? '' : 's'}`;

export const formatSeconds = (s: number) => {
    if (s === 0) return '0 seconds';

    let parts: string[] = [];

    if (s >= 3600) {
        const hours = Math.floor(s / 3600);
        s -= hours * 3600;
        parts.push(formatPlural(hours, 'hour'));
    }

    if (s >= 60) {
        const minutes = Math.floor(s / 60);
        s -= minutes * 60;
        parts.push(formatPlural(minutes, 'minute'));
    }

    if (s > 0) {
        parts.push(formatPlural(s, 'second'));
    }

    return parts.join(' ');
};