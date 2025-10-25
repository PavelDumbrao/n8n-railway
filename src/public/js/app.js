const loginButton = document.getElementById('google-login');

loginButton?.addEventListener('click', () => {
  window.location.href = '/auth/google';
});

async function bootstrap() {
  try {
    const response = await fetch('/api/session', {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Не удалось получить состояние сессии');
    }

    const payload = await response.json();
    if (payload.authenticated) {
      window.location.replace('/dashboard');
    }
  } catch (error) {
    console.error(error);
  }
}

bootstrap();
