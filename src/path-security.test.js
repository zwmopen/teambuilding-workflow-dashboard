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

test('extension product tree exposes every local folder and rejects path escape', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-product-tree-'));
  const root = path.join(parent, 'products');
  const sent = path.join(root, '已发送');
  const publish = path.join(root, '发布空间');
  const recent = path.join(root, '刚刚下载打包');
  fs.mkdirSync(sent, { recursive: true });
  fs.mkdirSync(publish, { recursive: true });
  fs.mkdirSync(recent, { recursive: true });
  fs.writeFileSync(path.join(recent, '封面.png'), 'image');
  fs.writeFileSync(path.join(recent, '文案.txt'), 'copy');
  try {
    const snapshot = server.extensionProductTreeSnapshot('', root);
    assert.deepEqual(
      new Set(snapshot.entries.map((entry) => entry.name)),
      new Set(['刚刚下载打包', '发布空间', '已发送'])
    );
    const packageFolder = snapshot.entries.find((entry) => entry.name === '刚刚下载打包');
    assert.equal(packageFolder.imageCount, 1);
    assert.equal(packageFolder.textCount, 1);
    assert.equal(packageFolder.attachments.length, 2);
    assert.throws(
      () => server.extensionProductTreeSnapshot(parent, root),
      /只能读取当前成品库内部/
    );
  } finally {
    cleanup(parent);
  }
});

test('material usage ledger records prepared and used without moving source files', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-material-usage-'));
  const root = path.join(parent, 'materials');
  const post = path.join(root, '待加工帖子');
  const ledgerFile = path.join(parent, 'runtime', 'material-usage-ledger.json');
  fs.mkdirSync(post, { recursive: true });
  fs.writeFileSync(path.join(post, '封面.png'), 'image');
  try {
    const prepared = server.recordMaterialUsage(
      { entryPath: post, name: '待加工帖子', status: 'prepared', conversationUrl: 'https://chatgpt.com/c/test' },
      { materialRoot: root, ledgerFile }
    );
    assert.equal(prepared.status, 'prepared');
    assert.equal(fs.existsSync(post), true);
    const used = server.recordMaterialUsage(
      { entryPath: post, name: '待加工帖子', status: 'used', conversationUrl: 'https://chatgpt.com/c/test' },
      { materialRoot: root, ledgerFile }
    );
    assert.equal(used.status, 'used');
    assert.ok(used.usedAt);
    assert.equal(fs.existsSync(path.join(post, '封面.png')), true);
    assert.equal(server.getMaterialUsageLedger(ledgerFile).events.length, 2);
    const renamed = path.join(root, '已经改过名字的帖子');
    fs.renameSync(post, renamed);
    const duplicate = server.checkMaterialUsage(
      { entryPath: renamed },
      { materialRoot: root, ledgerFile }
    );
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.match, 'fingerprint');
  } finally {
    cleanup(parent);
  }
});

test('workspace folder move renames a real folder inside the same authorized root', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-move-folder-'));
  const root = path.join(parent, 'materials');
  const source = path.join(root, '待加工');
  const target = path.join(root, '已使用');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(source, '文案.txt'), 'copy');
  try {
    const result = server.moveWorkspaceEntry(
      { sourcePath: source, targetPath: target },
      { roots: [root] }
    );
    assert.equal(result.to, path.join(target, '待加工'));
    assert.equal(fs.existsSync(source), false);
    assert.equal(fs.readFileSync(path.join(result.to, '文案.txt'), 'utf8'), 'copy');
  } finally {
    cleanup(parent);
  }
});

test('workspace folder move rejects files, roots, links and cross-root targets', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-move-safety-'));
  const rootA = path.join(parent, 'materials');
  const rootB = path.join(parent, 'products');
  const source = path.join(rootA, '帖子');
  const child = path.join(source, '子目录');
  const target = path.join(rootA, '目标');
  const file = path.join(rootA, '文案.txt');
  fs.mkdirSync(child, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(rootB, { recursive: true });
  fs.writeFileSync(file, 'copy');
  try {
    assert.throws(
      () => server.moveWorkspaceEntry({ sourcePath: file, targetPath: target }, { roots: [rootA, rootB] }),
      /只能移动真实文件夹/
    );
    assert.throws(
      () => server.moveWorkspaceEntry({ sourcePath: rootA, targetPath: rootB }, { roots: [rootA, rootB] }),
      /不能移动素材库或成品库根目录/
    );
    assert.throws(
      () => server.moveWorkspaceEntry({ sourcePath: source, targetPath: child }, { roots: [rootA, rootB] }),
      /不能把文件夹移动到它自己或它的子文件夹里/
    );
    assert.throws(
      () => server.moveWorkspaceEntry({ sourcePath: source, targetPath: rootB }, { roots: [rootA, rootB] }),
      /只能在同一个素材库或成品库内部移动/
    );
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

test('external launcher only allows approved workflow sites and the existing work-package protocol', () => {
  assert.equal(server.isAllowedExternalTarget('https://chatgpt.com/'), true);
  assert.equal(server.isAllowedExternalTarget('https://chatgpt.com/c/abc'), true);
  assert.equal(server.isAllowedExternalTarget('https://mp.weixin.qq.com/'), true);
  assert.equal(server.isAllowedExternalTarget('cgpt-workpkg://run'), true);
  assert.equal(server.isAllowedExternalTarget('cgpt-workpkg://configure'), true);
  assert.equal(server.isAllowedExternalTarget('https://example.com/'), false);
  assert.equal(server.isAllowedExternalTarget('file:///C:/Windows/System32'), false);
});

test('ChatGPT and the extension may access the localhost bridge through private-network preflight', () => {
  const chatgpt = server.extensionCorsHeaders({ headers: { origin: 'https://chatgpt.com' } });
  assert.equal(chatgpt['Access-Control-Allow-Origin'], 'https://chatgpt.com');
  assert.equal(chatgpt['Access-Control-Allow-Private-Network'], 'true');
  const rejected = server.extensionCorsHeaders({ headers: { origin: 'https://evil.example' } });
  assert.equal(rejected['Access-Control-Allow-Origin'], undefined);
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
  assert.deepEqual(
    server.buildDistributionArgs({
      action: 'device-restock',
      device: '5号',
      type: 'traffic',
      collection: '作品集_015[泛]'
    }),
    ['--device', '5号', '--type', '泛流量', '--collection', '作品集_015[泛]']
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
