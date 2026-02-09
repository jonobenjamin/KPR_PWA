// Authentication UI components
class AuthUI {
  constructor() {
    this.container = null;
  }

  createAuthContainer() {
    this.container = document.createElement('div');
    this.container.id = 'auth-container';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    document.body.appendChild(this.container);
    return this.container;
  }

  showEmailForm() {
    if (!this.container) this.createAuthContainer();

    this.container.innerHTML = `
      <div style="
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        max-width: 400px;
        width: 90%;
        text-align: center;
      ">
        <h2 style="margin-bottom: 1.5rem; color: #333; font-size: 1.8rem;">KPR Monitoring App</h2>
        <p style="margin-bottom: 2rem; color: #666;">Enter your email to receive a sign-in link</p>

        <form id="email-form" style="display: flex; flex-direction: column; gap: 1rem;">
          <input
            type="email"
            id="email-input"
            placeholder="Enter your email"
            required
            style="
              padding: 0.8rem;
              border: 2px solid #e1e5e9;
              border-radius: 8px;
              font-size: 1rem;
              transition: border-color 0.3s;
            "
          />

          <button
            type="submit"
            id="email-submit-btn"
            style="
              padding: 0.8rem;
              background: #667eea;
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 1rem;
              cursor: pointer;
              transition: background 0.3s;
            "
          >
            Send Sign-In Link
          </button>
        </form>

        <div id="email-message" style="margin-top: 1rem; min-height: 1.5rem;"></div>
      </div>
    `;

    this.attachEmailFormListeners();
  }

  attachEmailFormListeners() {
    const form = document.getElementById('email-form');
    const submitBtn = document.getElementById('email-submit-btn');
    const messageDiv = document.getElementById('email-message');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email-input').value.trim();

      if (!email) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      messageDiv.textContent = '';

      const result = await window.authService.requestEmailPin(email);

      if (result.success) {
        messageDiv.innerHTML = '<p style="color: #28a745;">Sign-in link sent! Check your email.</p>';
        submitBtn.textContent = 'Link Sent!';
      } else {
        messageDiv.innerHTML = `<p style="color: #dc3545;">Error: ${result.error}</p>`;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Sign-In Link';
      }
    });
  }

  hide() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

window.authUI = new AuthUI();