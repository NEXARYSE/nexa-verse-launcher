(() => {
  const $ = selector => document.querySelector(selector);
  const trigger = $('#presenceTrigger');
  const menu = $('#presenceMenu');
  const modeSelect = $('#presenceSelect');
  const modeKey = 'nv_launcher_presence';
  let mode = ['online', 'idle', 'offline'].includes(localStorage.getItem(modeKey))
    ? localStorage.getItem(modeKey)
    : 'online';

  function renderProfile() {
    const label = $('#presenceLabel');
    const avatar = $('#presenceAvatar');
    const dot = $('#presenceDot');
    const sourceAvatar = $('#profile-avatar img');
    const sourceName = $('#profile-name');
    const status = $('#profile-status');
    const logoutAction = $('#profileLogout');
    const linked = !!sourceName && sourceName.textContent.trim() !== 'Discord not linked';
    if (label) label.textContent = sourceName?.textContent || 'Discord';
    if (modeSelect) modeSelect.value = mode;
    if (dot) dot.className = `presence-dot ${linked ? mode : 'offline'}`;
    if (trigger) trigger.title = `${label?.textContent || 'Discord'} · ${mode === 'offline' ? 'Appear offline' : mode[0].toUpperCase() + mode.slice(1)}`;
    if (avatar) {
      avatar.replaceChildren();
      if (sourceAvatar?.src) {
        const image = document.createElement('img');
        image.src = sourceAvatar.src;
        image.alt = 'Discord avatar';
        avatar.append(image);
      } else avatar.textContent = '◉';
    }
    const trophyCount = $('#homeTrophyCount')?.textContent || '0/55 completed';
    const profileTrophyCount = $('#profileTrophyCount');
    if (profileTrophyCount) profileTrophyCount.textContent = trophyCount.split('/')[0] || '0';
    if (status) status.dataset.launcherPresence = mode;
    if (logoutAction) {
      const icon = document.createElement('span');
      icon.textContent = linked ? '↪' : '◉';
      logoutAction.replaceChildren(icon, document.createTextNode(linked ? 'Log Out' : 'Link Discord'));
    }
  }

  trigger?.addEventListener('click', () => {
    const open = menu?.classList.toggle('hidden') === false;
    trigger.setAttribute('aria-expanded', String(open));
  });

  modeSelect?.addEventListener('change', async () => {
    mode = modeSelect.value;
    localStorage.setItem(modeKey, mode);
    await window.launcher?.setDiscordActivity(mode !== 'offline');
    renderProfile();
  });

  menu?.querySelectorAll('[data-profile-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.profileAction;
      menu.classList.add('hidden');
      trigger?.setAttribute('aria-expanded', 'false');
      if (action === 'logout') $('#accountBtn')?.click();
      else if (action === 'trophies') document.querySelector('.nav[data-page="trophies"]')?.click();
      else document.querySelector('.nav[data-page="settings"]')?.click();
    });
  });

  $('#settingsGear')?.addEventListener('click', () => document.querySelector('.nav[data-page="settings"]')?.click());
  document.querySelector('.trophy-summary')?.addEventListener('click', () => document.querySelector('.nav[data-page="trophies"]')?.click());
  document.querySelector('.trophy-summary')?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      document.querySelector('.nav[data-page="trophies"]')?.click();
    }
  });

  const dock = $('.home-dock');
  let selectedTile = null;
  let contextMenu = null;
  function closeTileMenu(clearSelection = false) {
    contextMenu?.remove();
    contextMenu = null;
    if (selectedTile) selectedTile.classList.remove('selected');
    if (clearSelection) selectedTile = null;
  }
  function openTileMenu(tile) {
    closeTileMenu();
    tile.classList.add('selected');
    selectedTile = tile;
    contextMenu = document.createElement('div');
    contextMenu.className = 'tile-context-menu';
    contextMenu.setAttribute('role', 'menu');
    const title = document.createElement('b');
    title.textContent = tile.dataset.page === 'logs' ? 'Game Logs' : tile.querySelector('span:last-child')?.textContent || 'Discord';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = 'Open';
    openButton.setAttribute('role', 'menuitem');
    openButton.addEventListener('click', () => {
      const destination = tile.dataset.page;
      if (destination) document.querySelector(`.nav[data-page="${destination}"]`)?.click();
      else {
        const url = tile.getAttribute('href');
        if (url) window.launcher?.openExternal(url);
      }
      closeTileMenu(true);
    });
    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.textContent = 'Back';
    backButton.setAttribute('role', 'menuitem');
    backButton.addEventListener('click', () => closeTileMenu(true));
    contextMenu.append(title, openButton, backButton);
    document.body.append(contextMenu);
    const rect = tile.getBoundingClientRect();
    const menuWidth = 150;
    const left = rect.right + menuWidth + 10 <= window.innerWidth
      ? rect.right + 8
      : Math.max(10, rect.left - menuWidth - 8);
    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${Math.max(10, Math.min(rect.top + rect.height / 2 - 48, window.innerHeight - 106))}px`;
    openButton.focus();
  }
  dock?.querySelectorAll('.dock-tile').forEach(tile => {
    tile.addEventListener('click', event => {
      event.preventDefault();
      if (selectedTile === tile && !contextMenu) openTileMenu(tile);
      else {
        closeTileMenu(true);
        selectedTile = tile;
        tile.classList.add('selected');
      }
    });
  });
  document.addEventListener('click', event => {
    if (contextMenu && !contextMenu.contains(event.target) && !dock?.contains(event.target)) closeTileMenu(true);
  });
  window.addEventListener('resize', () => closeTileMenu(true));
  window.addEventListener('scroll', () => closeTileMenu(true), true);
  document.addEventListener('click', event => {
    if (!$('#accountPresence')?.contains(event.target)) {
      menu?.classList.add('hidden');
      trigger?.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus();
    }
  });
  const profileObserver = new MutationObserver(renderProfile);
  ['#profile-name', '#profile-avatar', '#homeTrophyCount'].forEach(selector => {
    const node = $(selector);
    if (node) profileObserver.observe(node, { childList: true, subtree: true, characterData: true });
  });
  const trophyCount = $('#trophyCount');
  const summaryCount = $('#homeTrophyCount');
  const progress = $('#homeTrophyProgress');
  if (trophyCount && summaryCount) {
    new MutationObserver(() => {
      const value = trophyCount.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      if (!value) return;
      summaryCount.textContent = `${value[1]}/${value[2]} completed`;
      if (progress) progress.style.width = `${Number(value[1]) / Number(value[2]) * 100}%`;
      renderProfile();
    }).observe(trophyCount, { childList: true, subtree: true, characterData: true });
  }
  renderProfile();
  window.launcher?.setDiscordActivity(mode !== 'offline');
})();
