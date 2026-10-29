/* Separate platform session. No school role, metadata privilege or service key. */
(() => {
  const $ = id => document.getElementById(id);
  const kind = document.body.dataset.platformPage;
  const schoolId = new URLSearchParams(location.search).get('school');
  let client, context, school, provision, records = [], dirty = false, mutation = null;
  const dirtyForms = new Set();
  window.SchoolShieldPlatformError = error => {
    const value = String(error?.message || error || '');
    if (/last active principal/i.test(value)) return 'Preserve the last active Principal before making this change.';
    if (/already exists|duplicate|already reserved/i.test(value)) return 'A matching record or reserved operation already exists. Refresh and resume the original request.';
    if (/changed|revision|stale/i.test(value)) return 'The record changed. Refresh confirmed records before retrying.';
    if (/access denied|sign in|invalid session/i.test(value)) return 'Access could not be verified. Sign in with an authorised platform account.';
    if (/school.*match|another school|selected school/i.test(value)) return 'The request does not match the selected school. Return to the directory.';
    return 'The request could not be confirmed. Check access and backend configuration, then retry the original operation.';
  };
  const hasDraft = () => dirty || dirtyForms.size > 0;
  window.SchoolShieldPlatformDrafts = {
    has(id) { return dirtyForms.has(id); },
    clear(id) { dirtyForms.delete(id); },
    discard(id) {
      if (dirtyForms.has(id) && !confirm('Discard unsaved entries for this school?')) return false;
      dirtyForms.delete(id); return true;
    },
  };
  const status = message => { $('platformStatus').textContent = message; };
  const schoolUrl = id => 'super-admin-school.html?school=' + encodeURIComponent(id);
  const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
  const date = value => value ? new Date(value).toLocaleString('en-ZA') : '';
  const pendingKey = () => 'schoolshield-platform-provision:' + context.user_id;
  async function bounded(operation) {
    let timer;
    try { return await Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Server response timed out. Persistence is unconfirmed; retry the same request.')), 20000); })]); }
    finally { clearTimeout(timer); }
  }
  async function rpc(name, args = {}) {
    const {data, error} = await bounded(() => client.rpc(name, args));
    if (error) throw Error(error.message);
    return data;
  }
  async function busy(button, label, task) {
    if (button.disabled) return;
    const text = button.textContent;
    button.disabled = true; button.textContent = label; button.setAttribute('aria-busy', 'true');
    try { await task(); } catch (error) { status(window.SchoolShieldPlatformError(error)); }
    finally { button.disabled = false; button.textContent = text; button.removeAttribute('aria-busy'); }
  }
  function auditRows(rows) {
    $('auditRows').replaceChildren();
    for (const item of rows) {
      const row = $('auditRow').content.cloneNode(true);
      row.querySelectorAll('[data-cell]').forEach(cell => {
        const key = cell.dataset.cell;
        cell.textContent = key === 'created_at' ? date(item[key]) : item[key] || (key === 'actor_id' ? 'Trusted database operator' : '');
      });
      row.querySelector('[data-audit-detail]').hidden = !('previous_value' in item || 'new_value' in item);
      row.querySelector('[data-audit-detail]').onclick = () => {
        $('auditDetails').textContent = JSON.stringify({previous: item.previous_value, updated: item.new_value, reason: item.reason}, null, 2);
        $('auditDialog').showModal();
      };
      $('auditRows').append(row);
    }
  }
  function drawSchools() {
    const query = $('platformSearch').value.trim().toLowerCase();
    $('schoolRows').replaceChildren();
    const found = records.filter(row => [row.name, row.code, row.emis_number, row.email, row.designated_contact, row.lifecycle_status].join(' ').toLowerCase().includes(query));
    for (const item of found) {
      const row = $('schoolRow').content.cloneNode(true);
      row.querySelectorAll('[data-cell]').forEach(cell => { cell.textContent = cell.dataset.cell === 'created_at' ? date(item.created_at) : item[cell.dataset.cell]; });
      row.querySelector('[data-school-link]').href = schoolUrl(item.id);
      $('schoolRows').append(row);
    }
    $('schoolEmpty').hidden = found.length > 0;
  }
  async function load() {
    if (kind === 'directory') {
      const data = await rpc('platform_admin_directory'); records = data.schools; drawSchools(); auditRows(data.audit);
    } else {
      const data = await rpc('platform_admin_school', {p_school: schoolId});
      if (data.school.id !== schoolId) throw Error('School response did not match the selected school.');
      school = data.school; provision = data.provision;
      $('selectedSchoolName').textContent = school.name;
      $('selectedSchoolCode').textContent = school.code;
      $('selectedSchoolId').textContent = school.id;
      if ($('selectedSchoolMode')) $('selectedSchoolMode').textContent = school.data_mode;
      document.title = 'SchoolShield | ' + school.name + ' (' + school.code + ')';
      if (kind === 'operations') { await window.SchoolShieldOperationsPage.load({client,context,school,status}); return; }
      if (kind === 'branding') { await window.SchoolShieldBrandingPage.load({client,context,school,status}); return; }
      if (kind === 'accounts') { await window.SchoolShieldAccountsPage.load({client,context,school,status}); return; }
      document.querySelectorAll('[data-school-branding]').forEach(a=>a.href='super-admin-branding.html?school='+encodeURIComponent(school.id));
      document.querySelectorAll('[data-school-accounts]').forEach(a=>a.href='super-admin-accounts.html?school='+encodeURIComponent(school.id));
      document.querySelectorAll('[data-school-operations]').forEach(a=>a.href='super-admin-operations.html?school='+encodeURIComponent(school.id));
      for (const key of ['name','code','emis_number','physical_address','telephone','email','designated_contact']) $('schoolForm').elements[key].value = school[key] || '';
      $('schoolForm').elements.reason.value = '';
      $('schoolProvisionStatus').textContent = provision ? 'Provisioning: ' + provision.status + (provision.last_error ? ' — ' + provision.last_error : '') : '';
      $('resumeProvision').hidden = !provision || (provision.status === 'Completed' && !provision.principal_setup_pending) || provision.actor_id !== context.user_id;
      $('resumeProvision').textContent = provision?.status === 'Completed' ? 'Recover Principal setup link' : 'Retry incomplete provisioning';
      auditRows(data.audit); mutation = null; dirty = false;
    }
  }
  async function provisionSchool(fields, operation) {
    const {data: own, error} = await bounded(() => client.auth.getSession());
    if (error || !own.session) throw Error('Sign in again before provisioning.');
    const config = window.SCHOOLSHIELD_SUPABASE_CONFIG;
    const response = await bounded(() => fetch(config.url + '/functions/v1/provision-school', {
      method: 'POST', headers: {apikey: config.publishableKey, Authorization: 'Bearer ' + own.session.access_token, 'Content-Type':'application/json'},
      body: JSON.stringify({action:'create',operation_id:operation,fields}), signal: AbortSignal.timeout(20000),
    }));
    const result = await response.json();
    if (!response.ok || !result.ok) throw Error((result.error || 'Provisioning failed.') + ' Retry with the same details and operation; reserved records are retained.');
    if (!validId(result.school_id)) throw Error('Provisioning response did not identify the school.');
    return result;
  }
  function bindForms() {
    if (kind === 'operations') { window.SchoolShieldOperationsPage.bind(); return; }
    if (kind === 'branding') { window.SchoolShieldBrandingPage.bind(); return; }
    if (kind === 'accounts') { window.SchoolShieldAccountsPage.bind(); return; }
    document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => {
      if (button.dataset.close === 'provisionDialog' && dirty && !confirm('Close this form? The retained provisioning request will remain available.')) return;
      if (button.dataset.close === 'provisionDialog') dirty = false;
      $(button.dataset.close).close();
    }; });
    if ($('provisionDialog')) $('provisionDialog').addEventListener('cancel', event => {
      event.preventDefault(); document.querySelector('[data-close="provisionDialog"]').click();
    });
    $('platformRefresh').onclick = () => busy($('platformRefresh'), 'Refreshing...', async () => {
      if (dirty && !confirm('Discard the unsaved form entries and load confirmed server records?')) return;
      await load(); status('Confirmed school records loaded.');
    });
    if (kind === 'directory') {
      $('platformSearch').oninput = drawSchools;
      $('platformNew').onclick = () => {
        const retained = JSON.parse(sessionStorage.getItem(pendingKey()) || 'null');
        $('provisionForm').reset(); $('provisionResult').hidden = true; $('provisionForm').querySelector('[type=submit]').hidden = false; $('provisionForm').querySelector('[data-provision-status]').textContent = '';
        if (retained) for (const [key,value] of Object.entries(retained.fields)) if ($('provisionForm').elements[key]) $('provisionForm').elements[key].value = value;
        $('provisionForm').dataset.operation = retained?.operation || crypto.randomUUID();
        $('provisionDialog').showModal();
      };
      $('provisionForm').oninput = () => { dirty = true; };
      $('provisionForm').onsubmit = event => {
        event.preventDefault(); const form = event.currentTarget;
        const fields = Object.fromEntries(new FormData(form));
        const retained = JSON.parse(sessionStorage.getItem(pendingKey()) || 'null');
        if (retained && JSON.stringify(retained.fields) !== JSON.stringify(fields)) { form.querySelector('[data-provision-status]').textContent = 'An earlier request is retained. Retry its original details; do not create a second school to recover a failed invitation.'; return; }
        const operation = retained?.operation || form.dataset.operation;
        sessionStorage.setItem(pendingKey(), JSON.stringify({operation,fields}));
        busy(form.querySelector('[type=submit]'), 'Provisioning...', async () => {
          form.querySelector('[data-provision-status]').textContent = 'Creating school and Principal setup link...';
          try {
            const result = await provisionSchool(fields,operation);
            sessionStorage.removeItem(pendingKey()); dirty = false;
            $('provisionResult').hidden = false; $('provisionSchool').href = schoolUrl(result.school_id);
            $('provisionMessage').textContent = result.message; $('provisionLink').value = result.setup_link || '';
            form.querySelector('[data-provision-status]').textContent = 'Confirmed. No email delivery is claimed.';
            form.querySelector('[type=submit]').hidden = true;
            await load(); status('School provisioning confirmed. Deliver the setup link securely.');
          } catch (error) { form.querySelector('[data-provision-status]').textContent = window.SchoolShieldPlatformError(error) + ' Operation: ' + operation; throw error; }
        });
      };
    } else {
      $('schoolForm').oninput = event => { if (!event.target.readOnly) dirty = true; };
      $('schoolForm').onsubmit = event => {
        event.preventDefault(); const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form)); const reason = values.reason; delete values.reason; delete values.code;
        const signature = JSON.stringify({values,reason,revision:school.revision});
        if (!mutation || mutation.signature !== signature) mutation = {signature,id:crypto.randomUUID()};
        busy(form.querySelector('[type=submit]'), 'Saving...', async () => {
          status('Saving details for ' + school.name + ' (' + school.code + ')...');
          const saved = await rpc('platform_admin_save_school', {p_school:schoolId,p_revision:school.revision,p_operation:mutation.id,p_fields:values,p_reason:reason});
          if (saved.id !== schoolId) throw Error('Save response did not match the selected school.');
          dirty = false;
          try { await load(); status('Saved school details and audit history.'); }
          catch (_) { status('Save confirmed. Refresh to load the latest details.'); }
        });
      };
      $('resumeProvision').onclick = () => busy($('resumeProvision'), 'Retrying...', async () => {
        const result = await provisionSchool(provision.fields,provision.id);
        if (result.school_id !== schoolId) throw Error('Provisioning response did not match this school.');
        $('recoveredLink').value = result.setup_link || ''; $('recoveredLinkLabel').hidden = !result.setup_link;
        await load(); status(result.message);
      });
    }
  }
  async function start() {
    const config = window.SCHOOLSHIELD_SUPABASE_CONFIG;
    if (!config?.url || !config.publishableKey || !window.supabase) throw Error('Supabase public configuration is unavailable.');
    client = window.supabase.createClient(config.url,config.publishableKey,{auth:{storageKey:'schoolshield-platform-auth',storage:sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'}});
    if (kind === 'login') {
      $('platformLogin').onsubmit = event => {
        event.preventDefault(); const form = event.currentTarget;
        busy(form.querySelector('[type=submit]'), 'Signing in...', async () => {
          const result = await bounded(() => client.auth.signInWithPassword({email:form.elements.email.value.trim(),password:form.elements.password.value}));
          form.elements.password.value = '';
          if (result.error) throw Error('Sign in failed. Check your credentials.');
          try {
            const gate=await rpc('authorize_platform_login',{p_access_code:form.elements.accessCode.value.trim()});
            form.elements.accessCode.value='';
            if(!gate?.platform_admin || !gate.authorized) throw Error('Platform access denied.');
            await rpc('platform_admin_context');
          }
          catch (_) {
            try { await bounded(() => client.auth.signOut({scope:'local'})); } catch { /* The gate remains closed if sign-out is unconfirmed. */ }
            throw Error('Platform access denied. Check your admin access code and credentials. After five incorrect codes, wait 15 minutes.');
          }
          location.replace('super-admin.html');
        });
      };return;
    }
    const {data,error} = await bounded(() => client.auth.getUser());
    if (error || !data.user) throw Error('Sign in to the platform portal to continue.');
    context = await rpc('platform_admin_context');
    if (context.user_id !== data.user.id) throw Error('Platform identity verification failed.');
    $('platformLogout').hidden = false;
    $('platformLogout').onclick = () => busy($('platformLogout'),'Signing you out...',async()=>{
      if (hasDraft() && !confirm('Sign out with unsaved form entries?')) return;
      const result = await bounded(() => client.auth.signOut({scope:'local'}));if(result.error)throw result.error;
      dirty = false; dirtyForms.clear(); location.replace('super-admin-login.html');
    });
    if (kind !== 'directory' && !validId(schoolId)) throw Error('Select a valid school from the directory.');
    await rpc('open_platform_admin_portal',{p_operation:crypto.randomUUID()});
    await load(); bindForms();
    $('platformIdentity').textContent = context.email;
    $('platformContent').hidden = false; $('platformSignIn').hidden = true;
    status('Confirmed platform records loaded.');
    document.addEventListener('input', event => {
      const form = event.target.closest('form');
      if (['brandingForm','themeForm','accountForm','accessForm','supportForm'].includes(form?.id)) dirtyForms.add(form.id);
    });
    window.addEventListener('beforeunload',event=>{if(hasDraft()){event.preventDefault();event.returnValue='';}});
  }
  start().catch(error => { status(window.SchoolShieldPlatformError(error)); });
})();
