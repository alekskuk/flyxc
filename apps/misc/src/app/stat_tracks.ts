import { getHostName } from '@flyxc/common';
import { readFileSync } from 'fs';

const tracks = JSON.parse(readFileSync(`${__dirname}/assets/tracks.json`, 'utf-8'));

const numTracks = tracks.length;
const numHash = new Set(tracks.map((t) => t.hash)).size;

console.log(`- ${numTracks} tracks and ${numHash} unique`);

const countByHost = new Map<string, number>();

for (const { url } of tracks) {
  const host = getHostName(url) ?? 'n/a';
  countByHost.set(host, 1 + (countByHost.get(host) ?? 0));
}

console.log(`- Count by host`);
const hostCount = [...countByHost.entries()].filter(([h, c]) => c > 50);
hostCount.sort(([h1, c1], [h2, c2]) => c2 - c1);
console.log(hostCount);
