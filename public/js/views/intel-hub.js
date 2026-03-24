/* ── Intel Hub — Game Intelligence Management ─────────────────────────────────
   Batch control + live progress + paginated game browser + preview/edit drawer
   ─────────────────────────────────────────────────────────────────────────── */

const IntelHubView = (() => {

    // ── State ──────────────────────────────────────────────────────────────────
    let _pollId = null;
    let _page = 1, _currentFilter = 'all', _q = '';
    let _searchTimer = null;
    let _batch = null, _config = null;
    let _drawerRomId = null, _drawerType = null, _drawerName = null;

    // ── Helpers ────────────────────────────────────────────────────────────────
    const $  = id => document.getElementById(id);
    const alive = () => !!$('ihRoot');
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

    // ── API ────────────────────────────────────────────────────────────────────
    const api = {
        batch:  ()          => fetch('/api/intel/batch').then(r => r.json()),
        stats:  ()          => fetch('/api/intel/stats').then(r => r.json()),
        config: ()          => fetch('/api/intel/config').then(r => r.json()),
        games:  (p, f, q)   => fetch(`/api/intel/games?page=${p}&filter=${f}&q=${encodeURIComponent(q)}&limit=30`).then(r => r.json()),
        doc:    (id, t)     => fetch(`/api/intel/${id}/${t}`).then(r => r.ok ? r.json() : null),
        start:  (types, ms) => fetch('/api/intel/batch', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ types, delay: ms }) }).then(r => r.json()),
        stop:   ()          => fetch('/api/intel/batch', { method:'DELETE' }).then(r => r.json()),
        gen:    (id, t)     => fetch(`/api/intel/${id}/generate`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ type: t }) }).then(r => r.json()),
        save:   (id, t, md) => fetch(`/api/intel/${id}/${t}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ content_md: md }) }).then(r => r.json()),
        del:    (id, t)     => fetch(`/api/intel/${id}/${t}`, { method:'DELETE' }).then(r => r.json()),
    };

    // ── render() ───────────────────────────────────────────────────────────────
    async function render() {
        document.getElementById('app').innerHTML = `
        <div id="ihRoot" class="ih-root">

            <!-- ── Batch Control Card ────────────────────────────────────────── -->
            <div class="ih-batch-card">
                <div class="ih-bc-header">
                    <span class="ih-bc-title">🧠 Intel Downloader</span>
                    <span id="ihProvider" class="ih-provider-wrap"></span>
                </div>
                <div class="ih-bc-body">
                    <div class="ih-bc-left">
                        <div id="ihStatus" class="ih-status-text ih-status-idle">Ready to download</div>
                        <div class="ih-progress-row" id="ihProgressRow" style="display:none">
                            <div class="ih-progress-bar">
                                <div class="ih-progress-fill" id="ihFill" style="width:0%"></div>
                            </div>
                            <span class="ih-prog-txt" id="ihProgLabel">0 / 0</span>
                        </div>
                    </div>
                    <div class="ih-bc-right">
                        <div class="ih-opts" id="ihOpts">
                            <label class="ih-opt-lbl"><input type="checkbox" id="ihBio" checked> Bios</label>
                            <label class="ih-opt-lbl"><input type="checkbox" id="ihGuide" checked> Guides</label>
                            <label class="ih-opt-lbl"><input type="checkbox" id="ihTrivia" checked> Trivia</label>
                            <label class="ih-opt-lbl"><input type="checkbox" id="ihMovelist"> Movelists</label>
                            <select id="ihDelay" class="ih-sel">
                                <option value="0">No delay</option>
                                <option value="500" selected>500ms</option>
                                <option value="1000">1s</option>
                                <option value="2000">2s</option>
                            </select>
                        </div>
                        <div class="ih-bc-btns">
                            <button class="ih-btn ih-btn-start" id="ihBtnStart" onclick="IntelHubView._start()">▶ Start Batch</button>
                            <button class="ih-btn ih-btn-stop"  id="ihBtnStop"  onclick="IntelHubView._stop()"  style="display:none">⏹ Stop</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Stats Row ─────────────────────────────────────────────────── -->
            <div class="ih-stats-row">
                <div class="ih-stat">
                    <div class="ih-stat-val" id="ihSTot">—</div>
                    <div class="ih-stat-lbl">Total Games</div>
                </div>
                <div class="ih-stat ih-stat-bio">
                    <div class="ih-stat-val" id="ihSBio">—</div>
                    <div class="ih-stat-lbl">Bios Ready</div>
                    <div class="ih-stat-pct" id="ihSBioPct"></div>
                </div>
                <div class="ih-stat ih-stat-guide">
                    <div class="ih-stat-val" id="ihSGde">—</div>
                    <div class="ih-stat-lbl">Guides Ready</div>
                    <div class="ih-stat-pct" id="ihSGdePct"></div>
                </div>
                <div class="ih-stat ih-stat-trivia">
                    <div class="ih-stat-val" id="ihSTrv">—</div>
                    <div class="ih-stat-lbl">Trivia Ready</div>
                    <div class="ih-stat-pct" id="ihSTrvPct"></div>
                </div>
                <div class="ih-stat ih-stat-done">
                    <div class="ih-stat-val" id="ihSDone">—</div>
                    <div class="ih-stat-lbl">Fully Complete</div>
                    <div class="ih-stat-pct" id="ihSDonePct"></div>
                </div>
            </div>

            <!-- ── Filter Toolbar ────────────────────────────────────────────── -->
            <div class="ih-toolbar">
                <div class="ih-tabs" id="ihTabs">
                    <button class="ih-tab active" data-f="all"           onclick="IntelHubView._filter('all')">All</button>
                    <button class="ih-tab"         data-f="missing_bio"      onclick="IntelHubView._filter('missing_bio')">No Bio</button>
                    <button class="ih-tab"         data-f="missing_guide"    onclick="IntelHubView._filter('missing_guide')">No Guide</button>
                    <button class="ih-tab"         data-f="missing_trivia"   onclick="IntelHubView._filter('missing_trivia')">No Trivia</button>
                    <button class="ih-tab"         data-f="missing_both"     onclick="IntelHubView._filter('missing_both')">Neither</button>
                    <button class="ih-tab"         data-f="complete"         onclick="IntelHubView._filter('complete')">✓ Complete</button>
                </div>
                <input class="ih-search-input" id="ihQ" type="search" placeholder="🔍 Search games..."
                    oninput="IntelHubView._search(this.value)">
            </div>

            <!-- ── Game Table ─────────────────────────────────────────────────── -->
            <div class="ih-table-wrap" id="ihTable">
                <div class="ih-loading">Loading...</div>
            </div>
            <div class="ih-pager" id="ihPager"></div>

            <!-- ── Drawer ─────────────────────────────────────────────────────── -->
            <div class="ih-drawer" id="ihDrawer">
                <div class="ih-drawer-header">
                    <div class="ih-drawer-info">
                        <div class="ih-drawer-game"      id="ihDGame"></div>
                        <div class="ih-drawer-type-badge" id="ihDType"></div>
                    </div>
                    <div class="ih-drawer-tabs">
                        <button class="ih-dtab active" id="ihDPrev" onclick="IntelHubView._tab('preview')">Preview</button>
                        <button class="ih-dtab"         id="ihDEdit" onclick="IntelHubView._tab('edit')">Edit</button>
                    </div>
                    <button class="ih-drawer-close" onclick="IntelHubView._close()">✕</button>
                </div>
                <div class="ih-drawer-meta" id="ihDMeta"></div>
                <div class="ih-drawer-body">
                    <div class="ih-drawer-preview" id="ihDPreview"></div>
                    <textarea class="ih-drawer-editor" id="ihDEditor" style="display:none"
                        oninput="IntelHubView._onEdit()"></textarea>
                </div>
                <div class="ih-drawer-footer">
                    <button class="ih-btn ih-btn-regen" id="ihBtnRegen" onclick="IntelHubView._regen()">🔄 Re-download</button>
                    <button class="ih-btn ih-btn-del"                   onclick="IntelHubView._del()">🗑 Delete</button>
                    <div style="flex:1"></div>
                    <button class="ih-btn ih-btn-save" id="ihBtnSave"   onclick="IntelHubView._save()" style="display:none">💾 Save</button>
                </div>
            </div>
            <div class="ih-drawer-backdrop" id="ihBackdrop" onclick="IntelHubView._close()"></div>

        </div>`;   /* end innerHTML */

        _startPoll();
        _loadAll();
    }

    // ── Polling ────────────────────────────────────────────────────────────────
    function _startPoll() {
        _stopPoll();
        _pollId = setInterval(async () => {
            if (!alive()) { _stopPoll(); return; }
            try {
                const s = await api.batch();
                _updateBatch(s);
                // Refresh table while batch is running (active row highlight changes)
                if (s.running) _loadGames();
            } catch (e) { /* silent */ }
        }, 2000);
    }

    function _stopPoll() {
        if (_pollId) { clearInterval(_pollId); _pollId = null; }
    }

    // ── Load all data ──────────────────────────────────────────────────────────
    async function _loadAll() {
        try {
            const [cfg, batch, stats] = await Promise.all([api.config(), api.batch(), api.stats()]);
            _config = cfg;
            _updateBatch(batch);
            _updateStats(stats);
        } catch (e) { /* ignore */ }
        _loadGames();
    }

    // ── Update batch card ──────────────────────────────────────────────────────
    function _updateBatch(s) {
        if (!alive()) return;
        _batch = s;

        // Provider badge
        const pEl = $('ihProvider');
        if (pEl && _config) {
            const prov = _config.provider;
            pEl.innerHTML = prov === 'ollama'
                ? `<span class="ih-badge ih-badge-ollama">⚡ Ollama&nbsp;•&nbsp;${esc(_config.model)}</span>`
                : `<span class="ih-badge ih-badge-claude">🔮 Claude&nbsp;•&nbsp;${esc(_config.model)}</span>`;
        }

        const running = s.running;
        if ($('ihBtnStart')) $('ihBtnStart').style.display = running ? 'none' : '';
        if ($('ihBtnStop'))  $('ihBtnStop').style.display  = running ? '' : 'none';
        if ($('ihOpts'))     $('ihOpts').style.opacity      = running ? '0.5' : '1';

        // Progress bar
        const pRow = $('ihProgressRow');
        if (pRow) pRow.style.display = (running || s.done > 0) ? '' : 'none';
        if (running || s.done > 0) {
            const pct = s.pct || 0;
            if ($('ihFill'))      $('ihFill').style.width       = pct + '%';
            if ($('ihProgLabel')) $('ihProgLabel').textContent   =
                `${s.done||0} / ${s.total||0} (${pct}%)${s.errors ? `  ✗ ${s.errors} errors` : ''}`;
        }

        // Status text
        const stEl = $('ihStatus');
        if (!stEl) return;
        stEl.className = 'ih-status-text ' + (running ? 'ih-status-running' : s.done > 0 ? 'ih-status-done' : 'ih-status-idle');
        if (running) {
            const curr = s.current;
            const rt   = s.startedAt ? _fmtTime(s.startedAt) : '';
            stEl.innerHTML = curr
                ? `<span class="ih-pulse">●</span> Downloading <strong>${esc(curr.type)}</strong> for "${esc(curr.title)}" <span class="ih-runtime">${rt}</span>`
                : `<span class="ih-pulse">●</span> Starting…`;
        } else if (s.finishedAt && s.done > 0) {
            stEl.textContent = `✓ Last run: ${s.done} docs downloaded, ${s.errors} errors`;
        } else {
            stEl.textContent = 'Ready to download';
        }
    }

    // ── Update stats tiles ─────────────────────────────────────────────────────
    function _updateStats(s) {
        if (!alive()) return;
        const pct = (n, d) => d > 0 ? `${Math.round(n/d*100)}%` : '—';
        if ($('ihSTot'))      $('ihSTot').textContent     = s.total_titles?.toLocaleString() ?? s.total?.toLocaleString() ?? '—';
        if ($('ihSBio'))      $('ihSBio').textContent     = s.bios?.toLocaleString()  ?? '—';
        if ($('ihSGde'))      $('ihSGde').textContent     = s.guides?.toLocaleString() ?? '—';
        if ($('ihSTrv'))      $('ihSTrv').textContent     = s.trivia?.toLocaleString() ?? '—';
        if ($('ihSDone'))     $('ihSDone').textContent    = s.complete?.toLocaleString() ?? s.both?.toLocaleString() ?? '—';
        const t = s.total_titles || s.total || 0;
        if ($('ihSBioPct'))   $('ihSBioPct').textContent  = pct(s.bios, t);
        if ($('ihSGdePct'))   $('ihSGdePct').textContent  = pct(s.guides, t);
        if ($('ihSTrvPct'))   $('ihSTrvPct').textContent  = pct(s.trivia, t);
        if ($('ihSDonePct'))  $('ihSDonePct').textContent = pct(s.complete || s.both, t);
    }

    // ── Load & render game table ───────────────────────────────────────────────
    async function _loadGames() {
        try {
            const data = await api.games(_page, _currentFilter, _q);
            if (!alive()) return;
            _renderGames(data);
        } catch (e) {
            if ($('ihTable')) $('ihTable').innerHTML = `<div class="ih-empty">Error loading games: ${esc(e.message)}</div>`;
        }
    }

    function _renderGames(data) {
        const wrap = $('ihTable');
        if (!wrap) return;

        if (!data.games || data.games.length === 0) {
            wrap.innerHTML = `<div class="ih-empty">No games found${_q ? ` matching "<strong>${esc(_q)}</strong>"` : ''}</div>`;
            if ($('ihPager')) $('ihPager').innerHTML = '';
            return;
        }

        const currId = _batch?.current?.romId;

        const rows = data.games.map(g => {
            const name    = esc(g.title || g.clean_name || g.filename || '—');
            const sys     = esc(g.system_name || g.system_id || '');
            const isLive  = currId === g.id;
            const isSel   = g.id === _drawerRomId;

            const docBtn = (has, type, label) => has
                ? `<button class="ih-sbtn ih-s-yes" data-rom="${g.id}" data-type="${type}" data-name="${name}" onclick="IntelHubView._view(this)">✓ ${label}</button>`
                : `<button class="ih-sbtn ih-s-no"  data-rom="${g.id}" data-type="${type}" data-name="${name}" onclick="IntelHubView._gen(this)">✗ ${label}</button>`;

            return `<tr class="${isLive ? 'ih-row-live' : ''} ${isSel ? 'ih-row-sel' : ''}">
                <td class="ih-td-name">${name}${isLive ? '<span class="ih-livedot">●</span>' : ''}</td>
                <td class="ih-td-sys">${sys}</td>
                <td class="ih-td-doc">${docBtn(g.has_bio, 'bio', 'Bio')}</td>
                <td class="ih-td-doc">${docBtn(g.has_guide, 'guide', 'Guide')}</td>
                <td class="ih-td-doc">${docBtn(g.has_trivia, 'trivia', 'Trivia')}</td>
                <td class="ih-td-doc">${docBtn(g.has_movelist, 'movelist', 'Moves')}</td>
            </tr>`;
        }).join('');

        wrap.innerHTML = `<table class="ih-table">
            <thead><tr>
                <th>Game</th><th>System</th>
                <th class="ih-th-c">Bio</th><th class="ih-th-c">Guide</th><th class="ih-th-c">Trivia</th><th class="ih-th-c">Moves</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;

        _renderPager(data);
    }

    function _renderPager({ page, pages, total, limit }) {
        const el = $('ihPager');
        if (!el || pages <= 1) { if (el) el.innerHTML = `<span class="ih-pager-info">${total} games</span>`; return; }

        const from = (page - 1) * limit + 1;
        const to   = Math.min(page * limit, total);

        const btnPage = (n, label) =>
            `<button class="ih-pgbtn${n === page ? ' active' : ''}" onclick="IntelHubView._setPage(${n})">${label ?? n}</button>`;

        let btns = '';
        const window = 2;
        for (let i = 1; i <= pages; i++) {
            if (i === 1 || i === pages || Math.abs(i - page) <= window) {
                btns += btnPage(i);
            } else if (btns.slice(-9) !== '…</span>') {
                btns += `<span class="ih-pgdots">…</span>`;
            }
        }

        el.innerHTML = `
            <span class="ih-pager-info">${from}–${to} of ${total}</span>
            <div class="ih-pager-btns">
                ${page > 1 ? btnPage(page - 1, '‹') : ''}
                ${btns}
                ${page < pages ? btnPage(page + 1, '›') : ''}
            </div>`;
    }

    // ── Filter / Search / Pagination ───────────────────────────────────────────
    function _filter(f) {
        _currentFilter = f; _page = 1;
        document.querySelectorAll('#ihTabs .ih-tab').forEach(b => b.classList.toggle('active', b.dataset.f === f));
        _loadGames();
    }

    function _search(val) {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => { _q = val.trim(); _page = 1; _loadGames(); }, 320);
    }

    function _setPage(n) { _page = n; _loadGames(); window.scrollTo(0, 0); }

    // ── Open existing doc in drawer ────────────────────────────────────────────
    async function _view(btn) {
        const romId = parseInt(btn.dataset.rom);
        const type  = btn.dataset.type;
        const name  = btn.dataset.name;

        _drawerRomId = romId; _drawerType = type; _drawerName = name;
        _setDrawerHead(name, type);
        $('ihDMeta').textContent = '';
        $('ihDPreview').innerHTML = '<div class="ih-dl">Loading…</div>';
        $('ihDEditor').style.display = 'none';
        $('ihDPreview').style.display = '';
        _setTab('preview');
        $('ihBtnSave').style.display = 'none';
        _openDrawer();

        try {
            const doc = await api.doc(romId, type);
            if (!doc || doc.error) {
                $('ihDPreview').innerHTML = '<div class="ih-dl-err">Not found. Use Re-download.</div>';
            } else {
                _showDoc(doc);
            }
        } catch (e) {
            $('ihDPreview').innerHTML = `<div class="ih-dl-err">Error: ${esc(e.message)}</div>`;
        }
    }

    // ── Generate doc then show in drawer ──────────────────────────────────────
    async function _gen(btn) {
        const romId = parseInt(btn.dataset.rom);
        const type  = btn.dataset.type;
        const name  = btn.dataset.name;

        _drawerRomId = romId; _drawerType = type; _drawerName = name;
        _setDrawerHead(name, type);
        $('ihDMeta').textContent = 'Downloading…';
        $('ihDPreview').innerHTML = `
            <div class="ih-gen-status">
                <div class="ih-gen-spinner">⟳</div>
                <div class="ih-gen-msg">Downloading ${esc(type)} for <em>${name}</em></div>
                <div class="ih-gen-note">Takes 30–120 seconds depending on provider</div>
            </div>`;
        $('ihDEditor').style.display = 'none';
        $('ihDPreview').style.display = '';
        $('ihBtnSave').style.display = 'none';
        if ($('ihBtnRegen')) $('ihBtnRegen').disabled = true;
        _openDrawer();

        // Mark the table button as working
        const origText = btn.textContent; btn.textContent = '⟳'; btn.disabled = true;

        try {
            const result = await api.gen(romId, type);
            if (result.error) throw new Error(result.error);
            _showDoc(result);
            _loadGames();  // refresh table row status
            if (window.H) H.toast(`✓ Downloaded ${type} for "${name}"`, 'success');
        } catch (e) {
            $('ihDPreview').innerHTML = `<div class="ih-dl-err">Download failed: ${esc(e.message)}</div>`;
            if (window.H) H.toast(`Failed: ${e.message}`, 'error');
        } finally {
            if ($('ihBtnRegen')) $('ihBtnRegen').disabled = false;
        }
    }

    function _showDoc(doc) {
        const parts = [];
        if (doc.model)       parts.push(esc(doc.model));
        if (doc.tokens_used) parts.push(`${Number(doc.tokens_used).toLocaleString()} tokens`);
        if (doc.generated_at) parts.push(new Date(doc.generated_at).toLocaleDateString());
        $('ihDMeta').textContent = parts.join(' • ');
        $('ihDPreview').innerHTML = _renderMd(doc.content_md || '');
        $('ihDEditor').value = doc.content_md || '';
    }

    function _setDrawerHead(name, type) {
        if ($('ihDGame')) $('ihDGame').textContent = name;
        if ($('ihDType')) $('ihDType').textContent = type === 'bio' ? '📖 Biography' : '🎮 Guide';
    }

    // ── Drawer open/close ──────────────────────────────────────────────────────
    function _openDrawer() {
        const d = $('ihDrawer'), b = $('ihBackdrop');
        if (d) d.classList.add('ih-open');
        if (b) b.classList.add('ih-open');
    }

    function _close() {
        const d = $('ihDrawer'), b = $('ihBackdrop');
        if (d) d.classList.remove('ih-open');
        if (b) b.classList.remove('ih-open');
        _drawerRomId = null; _drawerType = null; _drawerName = null;
        // De-highlight table row
        document.querySelectorAll('.ih-row-sel').forEach(r => r.classList.remove('ih-row-sel'));
    }

    // ── Drawer tabs: preview / edit ────────────────────────────────────────────
    function _tab(mode) { _setTab(mode); }

    function _setTab(mode) {
        const isEdit = mode === 'edit';
        if ($('ihDPreview')) $('ihDPreview').style.display = isEdit ? 'none' : '';
        if ($('ihDEditor'))  $('ihDEditor').style.display  = isEdit ? '' : 'none';
        if ($('ihDPrev'))    $('ihDPrev').classList.toggle('active', !isEdit);
        if ($('ihDEdit'))    $('ihDEdit').classList.toggle('active',  isEdit);
        if ($('ihBtnSave'))  $('ihBtnSave').style.display = isEdit ? '' : 'none';
    }

    function _onEdit() {
        // Content changed — keep Save button visible (already shown when edit tab active)
    }

    // ── Batch start/stop ───────────────────────────────────────────────────────
    async function _start() {
        const types = [];
        if ($('ihBio')?.checked)      types.push('bio');
        if ($('ihGuide')?.checked)    types.push('guide');
        if ($('ihTrivia')?.checked)   types.push('trivia');
        if ($('ihMovelist')?.checked) types.push('movelist');
        if (types.length === 0) { if (window.H) H.toast('Select at least one type', 'error'); return; }

        const delay = parseInt($('ihDelay')?.value || '500');

        try {
            const r = await api.start(types, delay);
            if (r.error) throw new Error(r.error);
            if (window.H) H.toast(`▶ Batch started — ${r.total} docs queued`, 'success');
            // Immediate status refresh
            const s = await api.batch();
            _updateBatch(s);
        } catch (e) {
            if (window.H) H.toast(`Failed to start: ${e.message}`, 'error');
        }
    }

    async function _stop() {
        try {
            await api.stop();
            if (window.H) H.toast('⏹ Stop signal sent — finishing current doc', 'info');
        } catch (e) {
            if (window.H) H.toast(`Error: ${e.message}`, 'error');
        }
    }

    // ── Drawer actions: regen / delete / save ──────────────────────────────────
    async function _regen() {
        if (!_drawerRomId || !_drawerType) return;
        if ($('ihBtnRegen')) $('ihBtnRegen').disabled = true;
        $('ihDMeta').textContent = 'Re-downloading…';
        $('ihDPreview').innerHTML = `
            <div class="ih-gen-status">
                <div class="ih-gen-spinner">⟳</div>
                <div class="ih-gen-msg">Re-downloading ${esc(_drawerType)} for <em>${esc(_drawerName || '')}</em></div>
            </div>`;
        $('ihDEditor').style.display = 'none';
        $('ihDPreview').style.display = '';
        _setTab('preview');

        try {
            const result = await api.gen(_drawerRomId, _drawerType);
            if (result.error) throw new Error(result.error);
            _showDoc(result);
            _loadGames();
            if (window.H) H.toast('✓ Re-downloaded!', 'success');
        } catch (e) {
            $('ihDPreview').innerHTML = `<div class="ih-dl-err">Failed: ${esc(e.message)}</div>`;
            if (window.H) H.toast(`Failed: ${e.message}`, 'error');
        } finally {
            if ($('ihBtnRegen')) $('ihBtnRegen').disabled = false;
        }
    }

    async function _del() {
        if (!_drawerRomId || !_drawerType) return;
        const name = _drawerName || 'this game';
        if (!confirm(`Delete ${_drawerType} for "${name}"? It will need to be re-downloaded.`)) return;
        try {
            await api.del(_drawerRomId, _drawerType);
            _close();
            _loadGames();
            if (window.H) H.toast('🗑 Deleted — will re-download in next batch', 'info');
        } catch (e) {
            if (window.H) H.toast(`Error: ${e.message}`, 'error');
        }
    }

    async function _save() {
        if (!_drawerRomId || !_drawerType) return;
        const content = $('ihDEditor')?.value || '';
        if (!content.trim()) { if (window.H) H.toast('Nothing to save', 'error'); return; }
        const btn = $('ihBtnSave');
        if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
        try {
            await api.save(_drawerRomId, _drawerType, content);
            $('ihDPreview').innerHTML = _renderMd(content);
            _setTab('preview');
            _loadGames();
            if (window.H) H.toast('💾 Saved!', 'success');
        } catch (e) {
            if (window.H) H.toast(`Save failed: ${e.message}`, 'error');
        } finally {
            if (btn) { btn.textContent = '💾 Save'; btn.disabled = false; }
        }
    }

    // ── Markdown Renderer ──────────────────────────────────────────────────────
    function _renderMd(md) {
        if (!md || !md.trim()) return '<em class="ih-no-content">No content available</em>';

        const inline = s => s
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,     '<em>$1</em>')
            .replace(/`(.+?)`/g,       '<code class="ih-icode">$1</code>');

        // Escape HTML first (preserves ** * ` which aren't HTML chars)
        const lines = md.split('\n').map(l =>
            l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        );

        let html = '', inUl = false, inOl = false;

        const closeList = () => {
            if (inUl) { html += '</ul>'; inUl = false; }
            if (inOl) { html += '</ol>'; inOl = false; }
        };

        for (const raw of lines) {
            if      (raw.startsWith('## '))   { closeList(); html += `<h2 class="ih-md-h2">${inline(raw.slice(3))}</h2>`; }
            else if (raw.startsWith('### '))  { closeList(); html += `<h3 class="ih-md-h3">${inline(raw.slice(4))}</h3>`; }
            else if (raw.startsWith('# '))    { closeList(); html += `<h1 class="ih-md-h1">${inline(raw.slice(2))}</h1>`; }
            else if (/^[-•]\s/.test(raw))     {
                if (inOl) { html += '</ol>'; inOl = false; }
                if (!inUl) { html += '<ul class="ih-md-ul">'; inUl = true; }
                html += `<li>${inline(raw.replace(/^[-•]\s/, ''))}</li>`;
            }
            else if (/^\d+\.\s/.test(raw))    {
                if (inUl) { html += '</ul>'; inUl = false; }
                if (!inOl) { html += '<ol class="ih-md-ol">'; inOl = true; }
                html += `<li>${inline(raw.replace(/^\d+\.\s/, ''))}</li>`;
            }
            else if (raw.trim() === '' || raw.startsWith('---')) { closeList(); }
            else if (raw.trim())  { closeList(); html += `<p class="ih-md-p">${inline(raw)}</p>`; }
        }
        closeList();
        return html || '<em class="ih-no-content">Empty document</em>';
    }

    // ── Format elapsed time ────────────────────────────────────────────────────
    function _fmtTime(startedAt) {
        const ms = Date.now() - new Date(startedAt).getTime();
        const s  = Math.floor(ms / 1000);
        const m  = Math.floor(s / 60);
        const h  = Math.floor(m / 60);
        if (h > 0) return `${h}h ${m % 60}m`;
        if (m > 0) return `${m}m ${s % 60}s`;
        return `${s}s`;
    }

    // ── Public API ─────────────────────────────────────────────────────────────
    return {
        render,
        _start, _stop, _regen, _del, _save,
        _filter, _search, _setPage,
        _view, _gen,
        _tab, _close, _onEdit,
    };

})(); /* end IntelHubView */
