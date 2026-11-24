/* ============================================================
 * 趣味挑战：页头的下拉菜单
 * ------------------------------------------------------------
 * 跳球挑战、躲球挑战两个小玩法原来各占一颗页头按钮，现在收进
 * 「趣味挑战」一颗按钮里，点开往下弹出两项。
 *
 * 这里只管“开关这张单子”，两个玩法自己的入口绑定（#btnJump / #btnDodge）
 * 还是留在 jump.js / dodge.js 里，所以点完照旧直接开浮层，逻辑不用改。
 * ============================================================ */
(function () {
  const wrap = document.getElementById('chal');
  const btn = document.getElementById('btnChal');
  const drop = document.getElementById('chalDrop');
  if (!wrap || !btn || !drop) return;

  let open = false;

  function setOpen(v) {
    if (open === v) return;
    open = v;
    drop.hidden = !v;
    btn.setAttribute('aria-expanded', v ? 'true' : 'false');
    wrap.classList.toggle('open', v);
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    setOpen(!open);
  });
  // 键盘：在按钮上按 ↓ 直接展开并落到第一项
  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      const first = drop.querySelector('.chal-item');
      if (first) first.focus();
    }
  });

  // 选到具体玩法就收起来（两个玩法各自的监听照旧接住这次点击）
  drop.addEventListener('click', e => {
    if (e.target.closest('.chal-item')) setOpen(false);
  });

  // 点别处、按 Esc 都收起来；点按钮自己不算“别处”（否则刚开就关）
  document.addEventListener('pointerdown', e => {
    if (open && !wrap.contains(e.target)) setOpen(false);
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && open) setOpen(false);
  });

  // 单子开着的时候顺手支持上下键切换、回车确认（键盘用户不用摸鼠标）
  drop.addEventListener('keydown', e => {
    const items = Array.from(drop.querySelectorAll('.chal-item'));
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (items[(at + 1) % items.length] || items[0]).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (items[(at - 1 + items.length) % items.length] || items[0]).focus();
    }
  });
})();
