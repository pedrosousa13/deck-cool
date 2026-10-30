import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  publishReleases,
  releasesFromPlan,
  releasesFromTarballs,
  releasesWithPublishConfigTags
} from './publish-packed.mjs';

/** @type {import('./publish-packed.mjs').PublishRelease} */
const core = {
  kind: 'publish',
  name: '@carouseldeck/core',
  version: '1.3.0',
  access: 'public',
  tag: 'latest',
  tarball: { path: 'packages/carouseldeck-core-1.3.0.tgz' }
};
/** @type {import('./publish-packed.mjs').PublishRelease} */
const react = {
  kind: 'publish',
  name: '@carouseldeck/react',
  version: '1.3.0',
  access: 'public',
  tag: 'latest',
  tarball: { path: 'packages/carouseldeck-react-1.3.0.tgz' }
};

test('releasesFromPlan flattens the plan in chunk order, dropping tag-only entries', () => {
  /** @type {import('./publish-packed.mjs').TagOnlyRelease} */
  const tagOnly = {
    kind: 'tag-only',
    name: '@carouseldeck/storybook',
    version: '1.3.0'
  };
  assert.deepEqual(releasesFromPlan({ plan: [[core], [react, tagOnly]] }), [
    core,
    react
  ]);
});

test('releasesFromTarballs orders a dependency before what depends on it', () => {
  /** @param {string} name @param {Record<string, string>} [dependencies] */
  const tarball = (name, dependencies) => ({
    path: `packages/${name.replace('@carouseldeck/', '')}.tgz`,
    readManifest: () => ({ name, version: '1.3.0', dependencies })
  });
  const result = releasesFromTarballs([
    tarball('@carouseldeck/react', { '@carouseldeck/core': '1.3.0' }),
    tarball('@carouseldeck/core')
  ]);
  assert.deepEqual(
    result.map((r) => r.name),
    ['@carouseldeck/core', '@carouseldeck/react']
  );
  assert.deepEqual(result[0].tarball, { path: 'packages/core.tgz' });
});

test('releasesFromTarballs throws on a dependency cycle', () => {
  /** @param {string} name @param {Record<string, string>} dependencies */
  const tarball = (name, dependencies) => ({
    path: `packages/${name}.tgz`,
    readManifest: () => ({ name, version: '1.0.0', dependencies })
  });
  assert.throws(
    () =>
      releasesFromTarballs([
        tarball('a', { b: '1.0.0' }),
        tarball('b', { a: '1.0.0' })
      ]),
    /dependency cycle/
  );
});

test('releasesWithPublishConfigTags reads a tag from the tarball manifest publishConfig', () => {
  /** @type {import('./publish-packed.mjs').PublishRelease} */
  const beta = {
    kind: 'publish',
    name: '@drawerdeck/react',
    version: '0.1.0-beta.0',
    access: 'public',
    tag: 'latest', // what a Changesets publish plan sets, wrongly
    tarball: { path: 'packages/drawerdeck-react-0.1.0-beta.0.tgz' }
  };
  /** @type {Record<string, { publishConfig?: { tag?: string } }>} */
  const manifests = {
    [beta.tarball.path]: { publishConfig: { tag: 'beta' } },
    [core.tarball.path]: {}
  };
  const result = releasesWithPublishConfigTags({
    releases: [beta, core],
    readManifest: (release) => manifests[release.tarball.path]
  });
  assert.deepEqual(
    result.map((r) => ({ name: r.name, tag: r.tag })),
    [
      { name: '@drawerdeck/react', tag: 'beta' },
      { name: '@carouseldeck/core', tag: 'latest' }
    ]
  );
});

/**
 * A fake npm registry and publisher: `has` is the set of name@version
 * already on npm, and `failAt` is the first tag publishing should fail at.
 * @param {{ has?: string[]; failAt?: string }} [options]
 */
const fakes = ({ has = [], failAt } = {}) => {
  /** @type {string[]} */
  const published = [];
  /** @type {string[]} */
  const logged = [];
  return {
    published,
    logged,
    /** @param {string} name @param {string} version */
    isOnNpm: async (name, version) => has.includes(`${name}@${version}`),
    /**
     * @param {{ name: string; version: string }} release
     * @returns {Promise<{ ok: true } | { ok: false; message: string }>}
     */
    publish: async (release) => {
      const tag = `${release.name}@${release.version}`;
      if (tag === failAt) return { ok: false, message: 'E404 Not Found' };
      published.push(tag);
      return { ok: true };
    },
    /** @param {string} line */
    log: (line) => {
      logged.push(line);
    }
  };
};

test('publishes every release not already on npm, in order', async () => {
  const f = fakes();
  const result = await publishReleases({ releases: [core, react], ...f });
  assert.deepEqual(f.published, [
    '@carouseldeck/core@1.3.0',
    '@carouseldeck/react@1.3.0'
  ]);
  assert.deepEqual(result, {
    published: true,
    publishedPackages: [
      { name: '@carouseldeck/core', version: '1.3.0' },
      { name: '@carouseldeck/react', version: '1.3.0' }
    ]
  });
});

test('skips a release npm already has, and still publishes the rest', async () => {
  const f = fakes({ has: ['@carouseldeck/core@1.3.0'] });
  const result = await publishReleases({ releases: [core, react], ...f });
  assert.deepEqual(f.published, ['@carouseldeck/react@1.3.0']);
  assert.ok(
    f.logged.includes(
      '@carouseldeck/core@1.3.0 is already on npm; not publishing it again.'
    )
  );
  assert.equal(result.published, true);
  assert.deepEqual(result.publishedPackages, [
    { name: '@carouseldeck/react', version: '1.3.0' }
  ]);
});

test('stops at the first failure, reporting what published before it', async () => {
  const f = fakes({ failAt: '@carouseldeck/react@1.3.0' });
  const result = await publishReleases({ releases: [core, react], ...f });
  assert.deepEqual(f.published, ['@carouseldeck/core@1.3.0']);
  assert.deepEqual(result.publishedPackages, [
    { name: '@carouseldeck/core', version: '1.3.0' }
  ]);
  assert.equal(result.published, true);
  assert.match(
    result.failure ?? '',
    /@carouseldeck\/react@1\.3\.0: E404 Not Found/
  );
});

test('a failure before anything publishes reports published: false', async () => {
  const f = fakes({ failAt: '@carouseldeck/core@1.3.0' });
  const result = await publishReleases({ releases: [core], ...f });
  assert.equal(result.published, false);
  assert.deepEqual(result.publishedPackages, []);
  assert.match(result.failure ?? '', /@carouseldeck\/core@1\.3\.0/);
});

test('nothing to publish: no release is on npm or in the plan', async () => {
  const f = fakes();
  const result = await publishReleases({ releases: [], ...f });
  assert.deepEqual(result, { published: false, publishedPackages: [] });
});
