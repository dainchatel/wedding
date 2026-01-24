require('dotenv').config();
const express = require('express');
const session = require('express-session');
const app = express();

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.WEDDING_PASSWORD || 'changeme';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Disable caching in development for hot reloading
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });
}

app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'wedding-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    // No maxAge means it's a session cookie - expires when browser closes
  }
}));

// Check if user is authenticated
const requireAuth = (req, res, next) => {
  if (req.session.authenticated) {
    return next();
  }
  res.redirect('/');
};

// Login page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Wedding</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: white;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        .container {
          text-align: center;
        }
        form {
          display: flex;
          flex-direction: column;
          gap: 15px;
          align-items: center;
        }
        input[type="password"] {
          padding: 12px 20px;
          font-size: 16px;
          border: 2px solid #ddd;
          border-radius: 8px;
          width: 250px;
          outline: none;
          transition: border-color 0.3s;
        }
        input[type="password"]:focus {
          border-color: #999;
        }
        button {
          padding: 12px 30px;
          font-size: 16px;
          background: #333;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.3s;
        }
        button:hover {
          background: #555;
        }
        .error {
          color: #d32f2f;
          font-size: 14px;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <form method="POST" action="/login">
          <input type="password" name="password" placeholder="Enter password" required autofocus>
          <button type="submit">Enter</button>
          ${req.query.error ? '<div class="error">Incorrect password. Please try again.</div>' : ''}
        </form>
      </div>
    </body>
    </html>
  `);
});

// Handle login
app.post('/login', (req, res) => {
  if (req.body.password === PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/wedding');
  } else {
    res.redirect('/?error=1');
  }
});

// Protected wedding page
app.get('/wedding', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Wedding</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Playfair Display', serif;
          background: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          padding: 40px 20px;
        }
        h1 {
          font-size: 72px;
          font-weight: 700;
          letter-spacing: 4px;
          color: #333;
          margin-bottom: 20px;
        }
        .date-location {
          font-size: 24px;
          font-weight: 400;
          color: #666;
          margin-bottom: 50px;
          letter-spacing: 1px;
        }
        img {
          max-width: 80%;
          max-height: 70vh;
          width: auto;
          height: auto;
          object-fit: contain;
          border-radius: 8px;
          margin-bottom: 40px;
        }
        .details {
          font-size: 18px;
          font-weight: 400;
          color: #888;
          font-style: italic;
          letter-spacing: 0.5px;
        }
      </style>
    </head>
    <body>
      <h1>WEDDING</h1>
      <div class="date-location">OCTOBER 10, 2026 - BROOKLYN, NY</div>
      <img src="/IMG_8784.JPG" alt="Wedding">
      <div class="details">Details to follow</div>
    </body>
    </html>
  `);
});

// Logout route (optional, for testing)
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
