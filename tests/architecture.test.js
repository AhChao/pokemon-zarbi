// 架構防回潮（feature-module-budget-decomposition 的 guard）：用行數預算把「god 檔重新長大」變成紅燈。
// 規則：單一畫面 module 超過預算 → 拆成新 module，**不要調高這裡的數字**（調高就是這條測試要擋的退步）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW_DIR = join(ROOT, 'src', 'views');

// 畫面 module 含大量 inline HTML 模板，門檻比純邏輯模組寬，但仍是「該拆了嗎」的提醒線。
const FEATURE_BUDGET = 300; // 行；超過＝拆分，勿調高
const FACADE_BUDGET = 200;  // app.js 只負責路由 / 分流外殼 / init
const MIN_FEATURES = 12;    // 證明 god 檔確實被拆開

const lineCount = (path) => readFileSync(path, 'utf8').split('\n').length;
const viewFiles = () => readdirSync(VIEW_DIR).filter((f) => f.endsWith('.js'));

test('每個畫面 module 在行數預算內（超過請拆成新 module，不要調高預算）', () => {
  const over = viewFiles()
    .map((f) => ({ f, n: lineCount(join(VIEW_DIR, f)) }))
    .filter((x) => x.n > FEATURE_BUDGET)
    .map((x) => `${x.f}: ${x.n} > ${FEATURE_BUDGET}`);
  assert.deepEqual(over, [], `超出預算的畫面 module（請拆分，勿調高預算）：\n${over.join('\n')}`);
});

test('已拆出足夠多的畫面 module（證明 god 檔確實被拆開）', () => {
  const n = viewFiles().length;
  assert.ok(n >= MIN_FEATURES, `只有 ${n} 個畫面 module，應至少 ${MIN_FEATURES} 個`);
});

test('app.js 維持 facade 規模（路由 / 分流 / init），畫面行為都在 views/*', () => {
  const n = lineCount(join(ROOT, 'src', 'app.js'));
  assert.ok(n <= FACADE_BUDGET, `app.js ${n} 行 > facade 預算 ${FACADE_BUDGET}（畫面行為應移進 views/*）`);
});
