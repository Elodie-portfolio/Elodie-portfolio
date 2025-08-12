exports.handler = async (event, context) => {
  const { code, state } = event.queryStringParameters || {};
  
  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No authorization code provided' })
    };
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GitHub OAuth not configured' })
    };
  }

  try {
    // Échanger le code contre un token d'accès
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: tokenData.error_description || tokenData.error })
      };
    }

    // Script pour envoyer le token au CMS - Protocole Decap CMS 2024
    const script = `
      <script>
        (function() {
          const authData = {
            token: "${tokenData.access_token}",
            provider: "github"
          };
          
          console.log("Auth callback ready with token:", authData.token.substring(0, 8) + "...");
          
          function sendAuthData() {
            if (window.opener) {
              console.log("Sending authorization data to parent window");
              
              // Protocole exact Decap CMS
              window.opener.postMessage(
                "authorization:github:success:" + JSON.stringify(authData),
                "${process.env.URL}"
              );
              
              console.log("Auth data sent successfully");
              
              // Fermer la popup après succès
              setTimeout(() => {
                console.log("Closing auth popup");
                window.close();
              }, 1000);
            } else {
              console.error("No opener window found");
            }
          }
          
          // Écouter les messages du CMS parent
          function receiveMessage(e) {
            console.log("Received message:", e.data, "from origin:", e.origin);
            
            if (e.origin === "${process.env.URL}") {
              if (e.data === "authorizing:github") {
                console.log("CMS requesting authorization");
                sendAuthData();
              }
            }
          }
          
          window.addEventListener("message", receiveMessage, false);
          
          // Envoyer immédiatement si la fenêtre parent existe
          if (window.opener) {
            console.log("Notifying parent window of authorization readiness");
            window.opener.postMessage("authorizing:github", "${process.env.URL}");
            
            // Envoyer aussi directement le token après un court délai
            setTimeout(sendAuthData, 500);
          }
          
          // Fallback : fermer automatiquement après 10 secondes
          setTimeout(() => {
            console.log("Auto-closing auth window (timeout)");
            window.close();
          }, 10000);
        })();
      </script>
    `;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentification réussie</title>
          </head>
          <body>
            <h1>Authentification réussie !</h1>
            <p>Vous pouvez fermer cette fenêtre.</p>
            ${script}
          </body>
        </html>
      `
    };

  } catch (error) {
    console.error('OAuth callback error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}; 