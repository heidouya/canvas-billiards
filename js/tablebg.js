'use strict';

/* ============================================================
 * 小玩法共用的台桌画法
 * ------------------------------------------------------------
 * 跳球挑战和躲球挑战都是「独立浮层 + 自己的 canvas」，台桌却和主玩法
 * 是同一套几何。抽到这里一份，两个小玩法都贴这张桌子：
 *   · 深色版：木框渐变 + 台呢径向渐变 + 库边胶条 + 袋口（照跳球原来的画法）
 *   · 手绘版：直接贴主玩法缓存好的纸面台桌（几何完全相同，不必再画一遍）
 * ============================================================ */
const TableBG = (function () {
  function draw(ctx, sketch) {
    if (sketch) {
      ctx.drawImage(sketchLayer(), 0, 0, VIEW_W, VIEW_H);
      return;
    }
    ctx.save();

    // 木框
    roundRect(ctx, 2, 2, VIEW_W - 4, VIEW_H - 4, 26);
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#8a5a36');
    g.addColorStop(0.35, '#6d4128');
    g.addColorStop(0.72, '#542f1c');
    g.addColorStop(1, '#38200f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,224,190,.22)';
    ctx.stroke();

    // 台呢
    const rg = ctx.createRadialGradient(MID_X, MID_Y, 60, MID_X, MID_Y, 660);
    rg.addColorStop(0, '#1b8f60');
    rg.addColorStop(0.55, '#0f7350');
    rg.addColorStop(1, '#08492f');
    ctx.fillStyle = rg;
    ctx.fillRect(TABLE.x, TABLE.y, TABLE.w, TABLE.h);

    // 内侧阴影
    const sh = ctx.createLinearGradient(0, TABLE.y, 0, TABLE.y + 26);
    sh.addColorStop(0, 'rgba(0,0,0,.32)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(TABLE.x, TABLE.y, TABLE.w, 26);
    const sh2 = ctx.createLinearGradient(0, TABLE.y + TABLE.h, 0, TABLE.y + TABLE.h - 26);
    sh2.addColorStop(0, 'rgba(0,0,0,.32)');
    sh2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh2;
    ctx.fillRect(TABLE.x, TABLE.y + TABLE.h - 26, TABLE.w, 26);

    // 库边胶条
    ctx.lineCap = 'butt';
    RAIL_SEGS.forEach(sg => {
      ctx.beginPath();
      ctx.moveTo(sg.x1, sg.y1);
      ctx.lineTo(sg.x2, sg.y2);
      ctx.lineWidth = 15;
      ctx.strokeStyle = '#0c5f3e';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.stroke();
    });

    // 袋口
    for (let i = 0; i < POCKETS.length; i++) {
      const p = POCKETS[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_R + 7, 0, TAU);
      ctx.fillStyle = 'rgba(20,10,4,.45)';
      ctx.fill();
      const pr = ctx.createRadialGradient(p.x - 6, p.y - 6, 2, p.x, p.y, POCKET_R);
      pr.addColorStop(0, '#000');
      pr.addColorStop(0.75, '#050809');
      pr.addColorStop(1, '#141a1e');
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_R, 0, TAU);
      ctx.fillStyle = pr;
      ctx.fill();
    }

    ctx.restore();
  }

  return { draw };
})();
