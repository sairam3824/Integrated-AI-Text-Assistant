document.addEventListener('DOMContentLoaded', function () {
    // Cache DOM elements
    const initialView = document.getElementById('initial-view');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    // Show login/signup buttons
    document.getElementById('show-login-btn').addEventListener('click', function () {
        hideAllSections();
        loginForm.classList.remove('hidden');
    });

    document.getElementById('show-signup-btn').addEventListener('click', function () {
        hideAllSections();
        signupForm.classList.remove('hidden');
    });

    // Switch between forms
    document.querySelectorAll('.switch-btn').forEach(button => {
        button.addEventListener('click', function () {
            hideAllSections();
            document.getElementById(this.dataset.target).classList.remove('hidden');
        });
    });

    // Form submissions
    document.getElementById('signup').addEventListener('submit', async function (e) {
        e.preventDefault();

        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;
        const messageElement = document.getElementById('signup-message');

        // Validate passwords match
        if (password !== confirmPassword) {
            displayMessage(messageElement, 'Passwords do not match!', 'error');
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Save userId and name in sessionStorage
                sessionStorage.setItem('userId', data.userId);
                sessionStorage.setItem('userName', name);

                // Show success message and redirect to content page
                displayMessage(messageElement, 'Registration successful! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = 'content.html';
                }, 1500);
            } else {
                displayMessage(messageElement, data.message, 'error');
            }
        } catch (error) {
            console.error('Error during signup:', error);
            displayMessage(messageElement, 'Connection error. Please try again later.', 'error');
        }
    });

    document.getElementById('login').addEventListener('submit', async function (e) {
        e.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const messageElement = document.getElementById('login-message');

        try {
            const response = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Save userId and name in sessionStorage
                sessionStorage.setItem('userId', data.userId);
                sessionStorage.setItem('userName', data.name);

                displayMessage(messageElement, `Welcome back, ${data.name}! Redirecting...`, 'success');
                setTimeout(() => {
                    window.location.href = 'content.html';
                }, 1500);
            } else {
                displayMessage(messageElement, data.message, 'error');
            }
        } catch (error) {
            console.error('Error during login:', error);
            displayMessage(messageElement, 'Connection error. Please try again later.', 'error');
        }
    });

    function hideAllSections() {
        initialView.classList.add('hidden');
        loginForm.classList.add('hidden');
        signupForm.classList.add('hidden');
    }

    function displayMessage(element, message, type) {
        element.textContent = message;
        element.className = 'message ' + type;
    }
});