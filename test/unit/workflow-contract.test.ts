import { readdirSync, readFileSync } from 'node:fs';
import { matchesGlob, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CI workflow contract. GitHub applies no default job timeout, and the apt-get
 * that `playwright install --with-deps` shells out to has stalled outright on
 * the hosted runners: four runs in a single day were killed at the six-hour
 * limit, each one blocking a pull request until it was re-run by hand the next
 * morning. Both guards -- a timeout on every job, and routing every browser
 * install through the bounded retrying script -- are one line each and exactly
 * the kind of thing a newly added workflow forgets, so pin them here.
 */
const ROOT = resolve(__dirname, '../..');
const WORKFLOW_DIR = resolve(ROOT, '.github/workflows');

const workflows = readdirSync(WORKFLOW_DIR)
  .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
  .map((file) => ({ file, src: readFileSync(resolve(WORKFLOW_DIR, file), 'utf8') }));

/**
 * Pull the top-level jobs out of a workflow. The repository has no YAML parser
 * in its dependencies (see hosting-contract.test.ts for the same trade-off),
 * and the shape needed here is narrow: job names sit at two spaces of indent
 * under `jobs:`, and their own keys at four.
 */
function parseJobs(src: string): Array<{ name: string; body: string }> {
  const lines = src.split('\n');
  const start = lines.indexOf('jobs:');
  if (start === -1) return [];

  const jobs: Array<{ name: string; body: string }> = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Za-z0-9_-]+:/.test(line)) break; // back out to the next top-level key
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (header) {
      jobs.push({ name: header[1], body: '' });
    } else if (jobs.length > 0) {
      jobs[jobs.length - 1].body += `${line}\n`;
    }
  }
  return jobs;
}

/** Read the step-level command/environment contract without depending on a flag's placement. */
function parseSteps(body: string): Array<{ name: string; run?: string; env: Record<string, string> }> {
  const steps: Array<{ name: string; run?: string; env: Record<string, string> }> = [];
  let inEnv = false;
  for (const line of body.split('\n')) {
    const header = line.match(/^ {6}- name: (.+)$/);
    if (header) {
      steps.push({ name: header[1], env: {} });
      inEnv = false;
      continue;
    }
    const step = steps.at(-1);
    if (!step) continue;
    if (/^ {8}env:/.test(line)) {
      inEnv = true;
      continue;
    }
    const variable = inEnv && line.match(/^ {10}([A-Z_][A-Z0-9_]*): (.+)$/);
    if (variable) {
      step.env[variable[1]] = variable[2];
      continue;
    }
    if (/^ {8}\S/.test(line)) inEnv = false;
    const run = line.match(/^ {8}run: (.+)$/);
    if (run) step.run = run[1];
  }
  return steps;
}

it('finds every workflow (a bad glob would make the checks below vacuous)', () => {
  expect(workflows.length).toBeGreaterThanOrEqual(2);
  expect(workflows.every(({ src }) => parseJobs(src).length > 0)).toBe(true);
});

describe.each(workflows)('$file', ({ src }) => {
  const jobs = parseJobs(src);

  it.each(jobs)('job $name is bounded by a timeout', ({ body }) => {
    const timeout = body.match(/^ {4}timeout-minutes: (\d+)$/m);
    expect(timeout).not.toBeNull();
    // A job that wants longer than an hour is either the nightly corpus run or
    // a hang; both should be a deliberate edit here rather than a default.
    expect(Number(timeout?.[1])).toBeLessThanOrEqual(300);
  });

  it('installs Playwright browsers only through the shared setup action', () => {
    expect(src).not.toMatch(/playwright install/);
    if (/playwright test|test:e2e|browsers:/.test(src)) {
      expect(src).toMatch(/uses: \.\/\.github\/actions\/setup/);
    }
  });
});

describe('the shared setup action', () => {
  const action = readFileSync(resolve(ROOT, '.github/actions/setup/action.yml'), 'utf8');

  it('routes the browser install through the retrying script', () => {
    expect(action).toMatch(/\.github\/scripts\/install-playwright\.sh/);
    expect(action).not.toMatch(/run: pnpm exec playwright install/);
  });

  it('caches the browsers against the distro and Playwright version, not the lockfile', () => {
    // Keying on the lockfile would evict the cache on every dependency bump
    // and re-download the browsers for no reason. The distro is part of the
    // key because Playwright builds per release: without it the 24.04 WebKit
    // was restored onto the 26.04 runner and could not start.
    expect(action).toMatch(/distro=\$\(\. \/etc\/os-release && echo "\$ID\$VERSION_ID"\)/);
    expect(action).toMatch(
      /key: playwright-\$\{\{ runner\.os \}\}-\$\{\{ steps\.playwright\.outputs\.distro \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ steps\.playwright\.outputs\.version \}\}/,
    );
  });
});

describe('the Playwright install script', () => {
  const script = readFileSync(resolve(ROOT, '.github/scripts/install-playwright.sh'), 'utf8');

  it('bounds each attempt and retries', () => {
    expect(script).toMatch(/timeout --kill-after=\d+s "\$\{attempt_timeout\}s"/);
    expect(script).toMatch(/for attempt in \$\(seq 1 "\$attempts"\)/);
  });

  it('keeps the apt config write off the path that never reaches apt', () => {
    // Ordering, not decoration: a skip that still sudo-writes an apt config is
    // a skip that can still fail for apt's reasons.
    expect(script.indexOf('skipping the apt font install')).toBeLessThan(script.indexOf('99-ci-timeouts'));
  });

  it('keeps the explicit Chromium dependency refresh advisory', () => {
    // The optional Chromium refresh only adds libraries already present on
    // the hosted image; required WebKit/Firefox dependencies are tested separately. Treating its
    // stall as fatal turned a bad Ubuntu mirror into a red pull request --
    // twice on one run, and sharding tripled the number of jobs exposed.
    expect(script).toMatch(/deps_are_advisory=true/);
    expect(script).toMatch(/if \[ "\$deps_are_advisory" = "true" \]; then[\s\S]*?exit 0/);
  });

  it('still fails hard when there is no cached browser to fall back on', () => {
    // Without the cache this step is what puts the browsers on disk; letting
    // it fail would hand the test step an error about nothing being installed.
    expect(script).toMatch(/deps_are_advisory=false/);
    expect(script).toMatch(/::error::playwright[\s\S]*?\nexit 1/);
  });

  it('does not spend the patient budget on an attempt it is willing to lose', () => {
    // The advisory path gave up only after 3 x 300s: a quarter of an hour per
    // job, spent to reach a verdict that no longer changes anything.
    const advisory = script.match(/deps_are_advisory=true\n\s*default_attempts=(\d+)\n\s*default_timeout=(\d+)/);
    expect(advisory).not.toBeNull();
    expect(Number(advisory![1]) * Number(advisory![2])).toBeLessThanOrEqual(180);
  });

  it('clears the apt locks a killed attempt leaves behind', () => {
    // Without this the retry fails instantly on "Could not get lock", which
    // would make the retry loop pure decoration.
    expect(script).toMatch(/\/var\/lib\/dpkg\/lock-frontend/);
  });
});

describe('bin/serve-pages-dev.sh', () => {
  const script = readFileSync(resolve(ROOT, 'bin/serve-pages-dev.sh'), 'utf8');
  const config = readFileSync(resolve(ROOT, 'playwright.pages.config.ts'), 'utf8');

  it('pins the compatibility date instead of letting wrangler default to today', () => {
    // wrangler defaults to the current date, and its workerd only supports
    // dates up to its own release: on 2026-08-19 that default broke the
    // e2e-pages job on every branch at once, main included. A date that
    // arrives on a calendar rather than in a commit is a time bomb.
    expect(script).toMatch(/--compatibility-date/);
    expect(script).toMatch(/^COMPATIBILITY_DATE=\d{4}-\d{2}-\d{2}$/m);
  });

  it('gives up on a server that never starts', () => {
    // The restart loop is there for a mid-run workerd crash, but retrying a
    // startup error forever is what buried the real message under Playwright's
    // "Timed out waiting 300000ms from config.webServer".
    expect(script).toMatch(/MAX_STARTUP_FAILURES=\d+/);
    expect(script).toMatch(/failed to start/);
  });

  it('is the only way the suite starts wrangler', () => {
    expect(config).toMatch(/bin\/serve-pages-dev\.sh/);
    expect(config).not.toMatch(/wrangler@latest pages dev/);
  });

  it('makes the tests wait for the restart the loop performs', () => {
    // The restart loop only helps if something waits for it. Playwright checks
    // the server once, at startup, and fires a retry immediately -- so a
    // mid-run crash took the case that hit it AND its retry, for a server that
    // was back ~20 s later. Both halves have to exist: the loop that restarts,
    // and the fixture that waits.
    expect(config).toMatch(/process\.env\.E2E_WAIT_FOR_SERVER = '1'/);
    const l0 = readFileSync(resolve(ROOT, 'test/e2e/lib/l0.ts'), 'utf8');
    expect(l0).toMatch(/E2E_WAIT_FOR_SERVER/);
    expect(l0).toMatch(/async function waitForServer/);
  });
});

describe('.github/workflows/ci.yml', () => {
  const ci = workflows.find(({ file }) => file === 'ci.yml')!.src;
  const ciJobs = parseJobs(ci);

  it('drops the run for a superseded pull request commit, but never for main', () => {
    expect(ci).toMatch(/^concurrency:$/m);
    expect(ci).toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  });

  const sharded = ciJobs.filter(({ body }) => parseSteps(body).some((step) => step.env.E2E_SHARD));

  it('shards every E2E suite (the three of them are the whole cost of the run)', () => {
    expect(sharded.map(({ name }) => name)).toEqual(['e2e-shard', 'e2e-pages-shard', 'e2e-docker-shard']);
  });

  it.each(sharded)('job $name splits into exactly as many shards as it declares', ({ body }) => {
    // Missing an index or using the wrong denominator silently drops tests.
    // The selector belongs to the executing step, so it reaches the CLI/config.
    const matrix = body.match(/shard: \[([^\]]+)\]/);
    const execution = parseSteps(body).filter((step) => step.env.E2E_SHARD);
    expect(matrix).not.toBeNull();
    expect(execution).toHaveLength(1);
    const denominator = execution[0].env.E2E_SHARD.match(/^\$\{\{\s*matrix\.shard\s*\}\}\/(\d+)$/);
    expect(denominator).not.toBeNull();
    const count = Number(denominator![1]);
    expect(matrix![1].split(',').map(Number)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(execution[0].run).toBeTruthy();
  });

  it.each([
    ['e2e', 'E2E', '[e2e-shard, e2e-serial]'],
    ['e2e-pages', 'E2E (Cloudflare Pages semantics)', 'e2e-pages-shard'],
    ['e2e-docker', 'E2E (Docker image)', 'e2e-docker-shard'],
  ])('%s reports the shard verdict under the name branch protection requires', (id, checkName, shardJob) => {
    // main requires these three checks by name. Renaming a summary job, or
    // letting one pass while its shards failed, leaves every pull request
    // either permanently pending or merged on a green that means nothing.
    const job = ciJobs.find(({ name }) => name === id);
    expect(job).toBeDefined();
    expect(job!.body).toMatch(new RegExp(`^ {4}name: ${checkName.replace(/[()]/g, '\\$&')}$`, 'm'));
    expect(job!.body.split('\n')).toContain(`    needs: ${shardJob}`);
    expect(job!.body).toMatch(/^ {4}if: always\(\)$/m);
    expect(job!.body).toContain('needs.' + (id === 'e2e' ? 'e2e-shard' : shardJob) + '.result');
    expect(job!.body).toMatch(/\[ "\$RESULT" = "success" \] \|\| exit 1/);
  });

  it('keeps the timing-budget cases out of the parallel pass and measures them alone', () => {
    // Two halves that only work as a pair. Drop the `--grep-invert` and the
    // budgets go back to competing with three other WASM editors for four
    // cores (measured: a 2 s font-system budget took 3.4 s). Drop the serial
    // pass and nothing measures them at all, silently -- the suite stays green
    // while a whole class of assertion stops running.
    const e2e = ciJobs.find(({ name }) => name === 'e2e-shard');
    expect(e2e).toBeDefined();
    const parallel = parseSteps(e2e!.body).find((step) => step.env.E2E_SHARD)!;
    const command = parallel.run!.split(/\s+/);
    expect(command.slice(0, 4)).toEqual(['pnpm', 'exec', 'playwright', 'test']);
    expect(command[command.indexOf('--grep-invert') + 1]).toBe('@serial');
    expect(command).not.toContain('--grep');
    const serial = ciJobs.find(({ name }) => name === 'e2e-serial');
    expect(serial?.body).toMatch(/playwright test --grep @serial --workers=1/);
    expect(e2e!.body).not.toMatch(/playwright test --grep @serial/);
    expect(ciJobs.find(({ name }) => name === 'e2e')?.body).toContain('needs.e2e-serial.result');
    expect(ciJobs.find(({ name }) => name === 'e2e')?.body).toContain('[ "$SERIAL_RESULT" = "success" ] || exit 1');
  });

  it('leaves the timing budgets to the primary suite only', () => {
    // The Pages and Docker suites prove hosting semantics; re-measuring a
    // wall-clock budget behind wrangler or inside a container adds noise, not
    // signal, and both run their cases in parallel.
    //
    // Pinned on the configs, not on the CI command line: as a flag it held
    // only for CI, so `pnpm run test:e2e:docker` locally still measured a
    // budget the job it is meant to reproduce never measures.
    for (const config of ['playwright.pages.config.ts', 'playwright.docker.config.ts']) {
      const src = readFileSync(resolve(__dirname, '../..', config), 'utf8');
      expect(src, config).toMatch(/grepInvert:\s*\/@serial\//);
    }
  });

  it('passes the shard to the Docker suite without going through pnpm', () => {
    // `pnpm run test:e2e:docker -- --shard=1/3` drops the arguments on the
    // floor: every shard then runs the whole suite, three times over, and the
    // run stays green while the sharding does nothing at all. Measured, not
    // assumed -- see docs/explorations/2026-08-19-ci-e2e-sharding.md.
    const docker = ciJobs.find(({ name }) => name === 'e2e-docker-shard')!;
    const execution = parseSteps(docker.body).find((step) => step.env.E2E_SHARD)!;
    expect(execution.run!.split(/\s+/)).toEqual(['sh', './bin/test-e2e-docker.sh']);
    expect(execution.env.E2E_SHARD).toMatch(/^\$\{\{\s*matrix\.shard\s*\}\}\/3$/);
    expect(parseSteps(docker.body).some((step) => /^pnpm run test:e2e:docker(?:\s|$)/.test(step.run || ''))).toBe(
      false,
    );
  });
});

/**
 * The preview gate waits on Cloudflare, which builds this repository close to
 * its limits: the vendored editor lives in git, so every preview clones ~616
 * MiB, checks out ~625 MB and uploads ~697 MB, while bin/build.sh itself runs
 * in about seven seconds. A preview was measured taking 36 minutes to conclude,
 * against a 25-minute wait -- so the gate reported red for a deployment that
 * was still building and went on to succeed.
 */

describe('bin/test-e2e-docker.sh', () => {
  const script = readFileSync(resolve(ROOT, 'bin/test-e2e-docker.sh'), 'utf8');

  it('forwards its arguments to Playwright', () => {
    expect(script).toMatch(/playwright test --config playwright\.docker\.config\.ts "\$@"/);
  });
});

// Familienbüro Pro: allgemeine Regeln des Repos. In der Vorlage standen sie im Block
// des nächtlichen Arbeitsablaufs, den es hier nicht gibt; dessen eigene Tests sind entfallen.
describe('repository contracts', () => {
  it('skips a device-emulating spec by project, not by browser name', () => {
    // `devices['Pixel 5']` carries `defaultBrowserType: 'chromium'`, which wins
    // over the project's browser -- so under the webkit/firefox projects
    // `browserName` reads 'chromium', a `browserName !== 'chromium'` guard
    // never fires, and Playwright tries to launch a browser this job does not
    // install. That was 16 of the 20 red rows on 2026-08-21.
    const specs = readdirSync(resolve(ROOT, 'test/e2e'))
      .filter((file) => file.endsWith('.spec.ts'))
      .map((file) => ({ file, body: readFileSync(resolve(ROOT, 'test/e2e', file), 'utf8') }))
      .filter(({ body }) => /test\.use\(\{\s*\.\.\.devices\[/.test(body));

    expect(specs.length).toBeGreaterThan(0);
    for (const { file, body } of specs) {
      expect(body, `${file} guards on browserName under a device override`).not.toMatch(
        /test\.skip\(\(\{ browserName \}\)/,
      );
      expect(body, `${file} has no project guard`).toMatch(/test\.skip\(\(\{ projectName \}\)/);
    }
    // The fixture the guard reads; `browserName` is built in, this one is ours.
    expect(readFileSync(resolve(ROOT, 'test/e2e/lib/l0.ts'), 'utf8')).toMatch(/projectName: \[/);
  });

  it('fails the lint on a warning, and lints the scripts we actually ship', () => {
    // oxlint exits 0 on warnings, so `lint:ts` used to be green with warnings
    // in it -- two were introduced and merged on 2026-09-12 without anything
    // noticing. --deny-warnings is what makes the job mean something.
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['lint:ts']).toBe('node bin/archive-quality.mjs lint && pnpm run tsc');
    expect(pkg.scripts.tsc).toBe("pnpm --recursive --filter '@ranuts/*' build && tsc --noEmit");
    const archiveGate = readFileSync(resolve(ROOT, 'bin/archive-quality.mjs'), 'utf8');
    expect(archiveGate).toContain("'oxlint'");
    expect(archiveGate).toContain("'--deny-warnings'");
    expect(archiveGate).toContain('verifyArchive(root, manifest)');
    const archive = JSON.parse(readFileSync(resolve(ROOT, 'docs/evaluations/archive-integrity.json'), 'utf8')) as {
      files: { path: string }[];
    };
    expect(archive.files.length).toBeGreaterThan(0);
    for (const { path } of archive.files) expect(path).toMatch(/^docs\/evaluations\/[\w.-]+\.(json|mjs|md)$/);

    // public/ used to be ignored wholesale, which took our own deploy-coupled
    // scripts out of the lint along with the vendored trees: sw.js alone is
    // ~500 lines of routing that decides whether a deploy reaches anybody.
    const oxlint = JSON.parse(readFileSync(resolve(ROOT, '.oxlintrc.json'), 'utf8')) as {
      ignorePatterns: string[];
    };
    expect(oxlint.ignorePatterns).not.toContain('**/public/**');
    for (const vendored of ['public/sdkjs/**', 'public/web-apps/**', 'public/fonts/**']) {
      expect(oxlint.ignorePatterns, vendored).toContain(vendored);
    }
    // Our own scripts can sit next to a vendored bundle (the SheetJS worker beside
    // xlsx.full.min.js); a directory-wide ignore there silently drops them.
    for (const own of ['public/sw.js', 'public/libs/sheetjs/convert.worker.js']) {
      const ignoredBy = oxlint.ignorePatterns.filter((pattern) => matchesGlob(own, pattern));
      expect(ignoredBy, own).toEqual([]);
    }
  });
});

it('balances Pages shards at test level without concurrent workerd requests', () => {
  const src = readFileSync(resolve(ROOT, 'playwright.pages.config.ts'), 'utf8');
  expect(src).toMatch(/fullyParallel: true/);
  expect(src).toMatch(/workers: 1/);
});
