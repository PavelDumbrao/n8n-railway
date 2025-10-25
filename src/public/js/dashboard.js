const avatarWrapper = document.getElementById('avatar-wrapper');
const avatar = document.getElementById('user-avatar');
const nameElement = document.getElementById('user-name');
const emailElement = document.getElementById('user-email');
const logoutButton = document.getElementById('logout');

async function loadProfile() {
  const sessionResponse = await fetch('/api/session', {
    credentials: 'include',
  });

  if (!sessionResponse.ok) {
    window.location.replace('/');
    return;
  }

  const session = await sessionResponse.json();
  if (!session.authenticated) {
    window.location.replace('/');
    return;
  }

  const profileResponse = await fetch('/api/google/profile', {
    credentials: 'include',
  });

  if (profileResponse.ok) {
    const profile = await profileResponse.json();
    nameElement.textContent = profile.name ?? 'Пользователь n8n';
    emailElement.textContent = profile.email ?? '';
    if (profile.picture) {
      avatar.src = profile.picture;
      avatar.referrerPolicy = 'no-referrer';
      avatarWrapper.hidden = false;
    } else {
      avatarWrapper.hidden = true;
    }
  }
}

logoutButton?.addEventListener('click', async () => {
  await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  window.location.replace('/');
});

loadProfile().catch((error) => {
  console.error(error);
  window.location.replace('/');
});
