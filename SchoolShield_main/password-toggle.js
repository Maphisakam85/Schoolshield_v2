/* Eye icon: Lucide (ISC). https://lucide.dev/icons/eye */
document.querySelectorAll('input[type="password"]').forEach((input) => {
  const wrapper = document.createElement('span');
  wrapper.className = 'password-field';
  input.before(wrapper);
  wrapper.append(input);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'password-toggle';
  toggle.setAttribute('aria-label', 'Show password');
  toggle.setAttribute('aria-pressed', 'false');
  if (input.id) toggle.setAttribute('aria-controls', input.id);
  toggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
  toggle.addEventListener('click', () => {
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.title = visible ? 'Hide password' : 'Show password';
  });
  wrapper.append(toggle);
});
