const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { PassThrough } = require('node:stream');

const server = require('./server');

function makeTemp(name) {
  return fs.mkdtempSync(path.join(__dirname, `.test-${name}-`));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('isPathInside rejects sibling paths that share a prefix', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-boundary-'));
  const root = path.join(parent, 'materials');
  const nested = path.join(root, 'nested', 'item');
  const sibling = path.join(parent, 'materials-backup', 'item');
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });
  try {
    assert.equal(server.isPathInside(root, nested), true);
    assert.equal(server.isPathInside(root, sibling), false);
    assert.equal(server.isPathInside(root, path.join(root, '..', 'escape')), false);
  } finally {
    cleanup(parent);
  }
});

test('safeName removes unsafe and Windows-reserved names', () => {
  assert.equal(server.safeName('../客户:素材*'), '.._客户_素材_');
  assert.equal(server.safeName('CON'), '_CON');
  assert.equal(server.safeName('LPT1.txt'), '_LPT1.txt');
  assert.equal(server.safeName('...   '), '未命名');
});

test('material collection commits atomically after all links succeed', () => {
  const library = makeTemp('success');
  const sourceA = path.join(library, 'A');
  const sourceB = path.join(library, 'B');
  fs.mkdirSync(sourceA);
  fs.mkdirSync(sourceB);
  try {
    const result = server.collectMaterialLinks(
      library,
      [{ path: sourceA, name: 'A' }, { path: sourceB, name: 'B' }],
      'test filter',
      {
        allowedRoots: [fs.realpathSync.native(__dirname)],
        linkDirectory(source, target) {
          fs.symlinkSync(source, target, 'junction');
        }
      }
    );
    assert.equal(result.created, 2);
    assert.equal(fs.existsSync(result.folderPath), true);
    assert.equal(fs.existsSync(path.join(result.folderPath, '筛选说明.json')), true);
    assert.equal(fs.readdirSync(library).some((name) => name.includes('.tmp-')), false);
  } finally {
    cleanup(library);
  }
});

test('material collection rolls back completely when a link fails', () => {
  const library = makeTemp('rollback');
  const sourceA = path.join(library, 'A');
  const sourceB = path.join(library, 'B');
  fs.mkdirSync(sourceA);
  fs.mkdirSync(sourceB);
  let calls = 0;
  try {
    assert.throws(() => {
      server.collectMaterialLinks(
        library,
        [{ path: sourceA, name: 'A' }, { path: sourceB, name: 'B' }],
        '',
        {
          allowedRoots: [fs.realpathSync.native(__dirname)],
          linkDirectory(source, target) {
            calls += 1;
            if (calls === 2) throw new Error('simulated junction failure');
            fs.symlinkSync(source, target, 'junction');
          }
        }
      );
    }, /simulated junction failure/);

    const generated = fs.readdirSync(library).filter((name) => name.startsWith('.筛选整合_'));
    assert.deepEqual(generated, []);
  } finally {
    cleanup(library);
  }
});

test('request reader rejects oversized bodies instead of hanging', async () => {
  const req = new PassThrough();
  req.headers = { 'content-length': '20' };
  const pending = server.getBody(req, 10);
  req.end('01234567890123456789');
  await assert.rejects(pending, (error) => error.statusCode === 413);
});

test('public file resolver prevents traversal outside the public directory', () => {
  const index = server.resolvePublicFile('/');
  const escaped = server.resolvePublicFile('/../server.js');
  assert.equal(escaped, index);
  assert.equal(path.basename(index), 'index.html');
});

test('buildDistributionArgs only creates allowlisted transfer commands', () => {
  assert.deepEqual(
    server.buildDistributionArgs({ action: 'device-restock', device: '5号', type: 'traffic' }),
    ['--device', '5号', '--type', '泛流量']
  );
  assert.deepEqual(
    server.buildDistributionArgs({ action: 'official-reserve', type: 'conversion' }),
    ['--official-account', '--type', '团建转化']
  );
  assert.throws(
    () => server.buildDistributionArgs({ action: 'run-anything', device: '5号' }),
    /不支持的分发操作/
  );
  assert.throws(
    () => server.buildDistributionArgs({ action: 'device-restock', device: '--help' }),
    /设备名称无效/
  );
});
