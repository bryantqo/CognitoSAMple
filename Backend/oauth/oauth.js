var AWS = require('aws-sdk');

const jwkToPem = require('jwk-to-pem');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

let env = process.env;

/*
    * This is the main entry point for the lambda function.
    * It will be called by the API Gateway.
    * It wrapps the handler_unwrapped in order to catch any errors that have not been handled.
*/
const handler = async function (event) {
    try
    {
        let res = await handler_unwrapped(event);
        console.log("Handler completed successfully");
        return res;
    }
    catch(ex)
    {
        console.log("Encountered an unhandled exception", ex);
        return ({ "error": "Parameter not found. Please check the config for the supplied environment." })
    }
}

/*
    * This is the main entry point for the lambda function.
    * Depending on the path of the request it will call the appropriate function.
    * It handles the following paths:
    * /api/oauth/callback
    * /api/oauth/refresh
    * /api/oauth/logout
*/
const handler_unwrapped = async function (event) {
    let path = event.path

    // Strip off our /api and /oauth if they are present
    // When runnign this locally the /api will not be present which is why we need to strip it off separately.
    path = path.replace(/^\/api/,"");
    path = path.replace(/^\/oauth\//,"");

    // Depending on the path we will call the appropriate function
    switch(path)
    {
        case "callback":
            console.log("Handling callback");
            return await handleCallback(event);
        case "refresh":
            console.log("Handling refresh");
            return await handleRefresh(event);
        case "logout":
            console.log("Handling logout");
            return await handleLogout(event);
        default:
            console.log("Unhandled path", path);
    }
}

/*
    * This function handles validating the token.
    * based on the input token it will go out tot he issuer (iss) and retrieve the public keys.
    * Then we map the kid to the public key and verify the token.
    * Token verification is handled by the jsonwebtoken library imported above.
*/
validateToken = async (token, tokenStr) => {
    let url = `${token.payload.iss}/.well-known/jwks.json`;
    
    let jwks = await fetch(url).then(res => res.json());

    var pems = {};
    var keys = jwks['keys'];
    
    for(var i = 0; i < keys.length; i++) {
        //Convert each key to PEM
        var key_id = keys[i].kid;
        var modulus = keys[i].n;
        var exponent = keys[i].e;
        var key_type = keys[i].kty;
        var jwk = { kty: key_type, n: modulus, e: exponent};
        var pem = jwkToPem(jwk);
        pems[key_id] = pem;
    };

    var kid = token.header.kid;
    var pem = pems[kid];

    if (!pem) {
        console.log('Invalid token. No pem found.', pems);
        return { valid: false, message: "Invalid Token. No pem found." };
    }

        return jwt.verify(tokenStr, pem, function(err, payload) {
        if(err) {
            console.log("Invalid Token. verification failed.");
            return { valid: false, message: "Invalid Token. Unable to verify." };
        } else {
              var customScope = payload['cognito:groups'] || [];
              return { valid: true, id: payload['sub'], groups: customScope };
        }
    });
}

/*
    * This function helps us obtain our oauth config.
    * This is just a sample and these values probably should not be hardcoded.
    * Here is where you would get your config from an appropriote source. For example you can use ssm or a database.
*/
obtainOAuthConfig = async () => {
    console.log("Obtaining OAuth config", env.DOMAIN, env.COGNITO_DOMAIN);

    return {
        "clientId": "123456789012",
        "clientSecret": "123456789012",
        "redirectUri": `https://${env.DOMAIN}/api/oauth/callback`,
        "scopes": [
            "openid",
            "profile",
            "email"
        ],
        "host": `${env.COGNITO_DOMAIN}`
    };
}

/*
    * This is a helper function that will exchange an authorization code for a token.
    * The code is posted to the oauth endpoint (/oauth2/token) along with authorization.
    * The response is a json object that contains the token.
*/
const exchangeOAuthCodeForToken = async (code) => {
    console.log("Exchanging a code for a token");

    let config = await obtainOAuthConfig();
    console.log("Using config", JSON.stringify(config));

    let redirectUri = config.redirectUri;
    let tokenUrl = `https://${config.host}/oauth2/token`;
    let authStr = config.clientId + ':' + config.clientSecret;
    let authorization = 'Basic ' + Buffer.from(authStr).toString('base64')
    let body = `grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}&client_id=${config.clientId}`;
    
    console.log("Sending request to exchange code for token", JSON.stringify({tokenUrl, authorization, body}));

    return await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': authorization
        },
        body: body
    }
    ).then(res => res.json());
}

/*
    * This is a helper function that will exchange a refresh token for a new token.
    * The refresh token is posted to the oauth endpoint (/oauth2/token) along with authorization.
    * The response is a json object that contains the token.
*/
const exchangeOAuthRefreshTokenForToken = async (refreshToken) => {
    console.log("Exchanging a refresh token for a token");

    let config = await obtainOAuthConfig();

    console.log("Using", JSON.stringify(config));

    let tokenUrl = `https://${config.host}/oauth2/token`;
    let authStr = config.clientId + ':' + config.clientSecret;
    let authorization = 'Basic ' + Buffer.from(authStr).toString('base64')
    let body = `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${config.clientId}`;

    return await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': authorization
        },
        body: body
    }
    ).then(res => res.json());
}

/*
    * This is a helper function that wraps a response into a json object that lambda/apigateway understands as a sucessful json response.
*/
const jsonSuccess = (body) =>
{
    console.log("Returning", body, JSON.stringify(body))
    return (
        {
            statusCode: 200,
            "isBase64Encoded": false,
            body: JSON.stringify(body),
            headers:
                {
                    'Content-Type' : 'application/json',
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,X-Api-Key,X-Amz-Security-Token"
                }
        });
}

/*
    * This is a helper function that wraps a response into a json object that lambda/apigateway understands as a sucessful html response.
*/
const htmlSuccess = (body, addlHeaders) => {
    console.log("Returning", body, JSON.stringify(body))

    let headers = {
        'Content-Type' : 'text/html',
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,X-Api-Key,X-Amz-Security-Token"
    }

    if(addlHeaders)
    {
        for(let key in addlHeaders)
        {
            console.log("Adding header", key, JSON.stringify(addlHeaders[key]));
            headers[key] = addlHeaders[key];
        }
    }

    return (
        {
            statusCode: 200,
            "isBase64Encoded": false,
            body: body,
            headers
        });
}

/*
    * This is a helper function that decodes the base64 encoded string of a jwt into a json object.
    * The token string consists of a preamble and a payload.
    * First we split the token into the preamble and the payload.
    * Then we convert the base64 into ascii.
    * Finally we convert the ascii into a json object.
*/
const decodeToken = (tokenStr) => {

    let preamble = tokenStr.split('.')[0];
    let payload = tokenStr.split('.')[1];

    let decodedToken = Buffer.from(payload, 'base64').toString('ascii');
    let decodedPre = Buffer.from(preamble, 'base64').toString('ascii');


    if(typeof decodedPre === 'string') {
        decodedPre = JSON.parse(decodedPre);
    }
    
    if(typeof decodedToken === 'string') {
        decodedToken = JSON.parse(decodedToken);
    }

    return { header: decodedPre, payload: decodedToken };

    
}

/*
    * This is the handler for the callback endpoint
    * This is redirected to when a user authorizes the application via the authorization code flow.
*/
const handleCallback = async (event) => {
    console.log("Handling callback");
    let code = event.queryStringParameters.code;
    let state = event.queryStringParameters.state;

    let token = await exchangeOAuthCodeForToken(code);

    if(token.error !== undefined) {
        console.log("Error exchanging code for token", token.error);
        let ret = "<html><body>Error exchanging code for token</body></html>";

        return htmlSuccess(ret);
    }
    

    let accessToken = decodeToken(token.access_token);
    let accessTokenStr = token.access_token;

    let verification = await validateToken(accessToken, accessTokenStr);

    if(!verification.valid) {
        console.log("Token is invalid");
        let ret = "<html><body>Token is invalid</body></html>";

        return htmlSuccess(ret);
    }

    let tokenStr = Buffer.from(JSON.stringify(token)).toString('base64')

    // this is the data sent back to the client via postMessage on the opener of the window
    let messageData = { 'type':'oauth-token', 'token': tokenStr, 'state': state };
    let message = JSON.stringify(messageData);

    // This is the body of the webpage we return. If you want to play around with this I suggest adding a debugger right after the script tag.
    let content = `<html><body>Logging you in...<script>window.opener.postMessage(${message}, '*'); setTimeout(()=>{window.close()},1000);</script></body></html>`;

    return htmlSuccess(content);
}

/*
    * This is the handler for the refresh endpoint
    * This is called when the user wants to refresh their token.
*/
const handleRefresh = async (event) => {
    console.log("Handling refresh");
    let refreshToken = event.body;

    let token = await exchangeOAuthRefreshTokenForToken(refreshToken);

    let tokenStr = Buffer.from(JSON.stringify(token)).toString('base64')

    let accessToken = decodeToken(token.access_token);
    let accessTokenStr = token.access_token;
    let verification = await validateToken(accessToken, accessTokenStr);

    if(!verification.valid) {
        console.log("Token is invalid");
        return jsonSuccess({"error": "Token is invalid"});
    }
    else
    {
        console.log("Token is valid");
    }

    let acls = await getACLs(accessToken);

    return jsonSuccess({ token: tokenStr, acls });
}

/*
    * This is the handler for the logout endpoint
    * For this sample it posts back to the window opener with a message that the user has logged out.
    * If you set any cookies in the callback process you should clear them here.
*/
const handleLogout = async (event) => {
    console.log("Handling logout");

    let content = `<html><body>Logging you out...<script>debugger;window.opener.postMessage({ 'type':'oauth-token', 'token': '', 'idToken': '' }, '*'); window.close();</script></body></html>`;

    return htmlSuccess(content);
}

module.exports = {
    handler
}

