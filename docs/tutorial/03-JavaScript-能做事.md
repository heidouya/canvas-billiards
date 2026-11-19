# 第 3 章 · JavaScript 能做事

**本章目标**：会用"如果……就……"做判断，会用一个循环处理 16 颗球，会用数组和对象描述一桌球，会写自己的函数。

**开始之前**：第 2 章 —— 变量、数字、字符串、`console.log`。

这一章是纯 JS 的最后一块地基。**看着枯燥，但每一条后面都会直接变成台球游戏里的一行代码。**

---

## 1. 如果……就……（条件判断）

游戏里到处是判断：球进袋了没有？轮到谁？力度够不够？

```js
const power = 0.03;
if (power > 0.04) {
  console.log('出杆');
} else {
  console.log('太轻了，不出杆');
}
```

- `if` 后面括号里是一个"是/不是"的问题
- 成立就执行 `{}` 里的代码，不成立就走 `else` 分支
- `else` 可以不写

比较符号：`>` 大于、`<` 小于、`>=` 大于等于、`<=`、`===` 等于、`!==` 不等于。

> **一定用 `===` 而不是 `==`。** `==` 会偷偷做类型转换（`'1' == 1` 居然成立），台球游戏里判断"是不是黑八"这种事必须严格，所以项目里全是 `===`。

多个条件组合：

```js
const ballInHand = true;
const isAITurn = false;
if (ballInHand && !isAITurn) {
  console.log('可以摆球');
}
```

`&&` 是"而且"，`||` 是"或者"，`!` 是"不是"。

---

## 2. 循环：同一件事做很多遍

台上有 16 颗球，每颗都要算位置、画出来。你不会想写 16 遍。

```js
for (let i = 0; i < 16; i++) {
  console.log('第 ' + i + ' 颗球');
}
```

拆开看：`let i = 0` 从 0 开始；`i < 16` 只要还小于 16 就继续；`i++` 每轮加 1。**跑 16 次，i 依次是 0…15。**

这是代码里最常见的循环写法，项目里所有"遍历所有球"的地方都是它。

---

## 3. 数组：一串东西装一个变量

16 颗球，装进一个盒子里：

```js
const balls = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
```

- `balls.length` → 15，一共几个
- `balls[0]` → 1，**下标从 0 开始**
- `balls[14]` → 15，最后一个

遍历它：

```js
for (let i = 0; i < balls.length; i++) {
  console.log(balls[i]);
}
```

或者更省事的写法：

```js
balls.forEach(function (id) {
  console.log(id);
});
```

`forEach` 的意思是"对每一个都做一遍这件事"。后面看到 `balls.forEach(...)`，你就知道它在遍历所有球。

---

## 4. 对象：一颗球的全部信息

一颗球不只有编号，还有位置、速度、在不在台上。把这些打包在一起：

```js
const ball = {
  id: 1,
  x: 794,
  y: 310,
  vx: 0,
  vy: 0,
  active: true
};
```

用点号取值：`ball.x`、`ball.id`。改值：`ball.vx = 120;`。

**这几乎就是项目里一颗球的真实结构**（`js/balls.js` 造球时就这么填的）。16 颗这样的对象放进数组，就是 `state.balls`。

数组和对象可以套在一起：

```js
const balls = [
  { id: 0, x: 260, y: 310 },
  { id: 1, x: 794, y: 310 }
];

console.log(balls[0].x);        // 260 —— 第一颗（母球）的横坐标
```

`state.balls[0]` 永远是母球，这是整个项目的约定，第 6 章会再强调。

---

## 5. 函数：把一段活儿包起来

```js
function powerPercent(power) {
  return Math.round(power * 100) + '%';
}

console.log(powerPercent(0.71));   // 71%
```

- `function` 声明一个函数
- 括号里是**参数**（别人交给你的东西）
- `return` 是**交出去的结果**
- 调用时写 `函数名(参数)`

有了函数，"力度转百分比"这件事只写一次，界面里到处调。

### 两个你马上要用的函数

**夹范围**（力度不能小于 0、不能大于 1）：

```js
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

console.log(clamp(1.3, 0, 1));    // 1
console.log(clamp(-0.2, 0, 1));   // 0
```

**算两点距离**：

```js
function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}
```

这两个就是项目 `js/util.js` 里的 `clamp` 和 `dist`，一行不差。

---

## 6. 合起来：一张能"算"的球桌

```js
const TABLE_X = 60;
const TABLE_W = 1000;
const BALL_R = 14;

function makeBall(id, x, y) {
  return { id: id, x: x, y: y, vx: 0, vy: 0, active: true };
}

const balls = [];
for (let i = 0; i < 16; i++) {
  balls.push(makeBall(i, TABLE_X + BALL_R, 310));   // 先全堆在左边，下一章再摆
}

// 打印每一颗球的编号和坐标
balls.forEach(function (b) {
  console.log(`球 ${b.id} 在 (${b.x}, ${b.y})`);
});

// 判断某颗球是不是贴到右库了
const b0 = balls[0];
if (b0.x + BALL_R >= TABLE_X + TABLE_W) {
  console.log('贴库了');
}
```

`push` 是"往数组末尾塞一个"。`makeBall` 是"造一颗球的工厂"。

---

## 7. 常见的坑

1. **下标从 0 开始。** 第 1 颗球是 `balls[0]` 不是 `balls[1]`。这是新手最容易错位的地方。
2. **`for` 写死循环。** `i < 16` 写成 `i > 16` 就一次都不跑；写成 `i--` 就跑到天荒地老。
3. **函数忘了 `return`。** 没有 `return` 的函数交出来的是 `undefined`（"什么都没有"）。

---

## 8. 动手练习

1. 写一个函数 `makeBall(id, x, y)`，造 3 颗球放进数组，循环打印它们的编号。
2. 遍历数组，如果 `id === 8`（黑八）就打印"这是黑八"。
3. 写函数 `powerPercent`，把 `0.06`、`0.5`、`1` 分别转成百分比打印。
4. 用 `clamp` 把 `1.7`、`-0.4` 都夹进 `0 ~ 1`，打印结果。
5. 造两颗球在 `(100, 100)` 和 `(200, 100)`，用 `dist` 算距离，判断"是否小于 28（两个球半径）"。

第 5 题就是第 9 章"球撞球"的判断起点——两个球心的距离小于 28 就说明它们叠在一起了。
