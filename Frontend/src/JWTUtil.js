
/*
    This is a collection of utility functions for working with JWT tokens
*/

const decodeBase64Token = (tokenBase64String) => {
        let token = JSON.parse(atob(tokenBase64String));
        return token;
    }

const decodeTokenToJWT = (token) => {
        let jwt = JSON.parse(atob(token.split('.')[1]));
        return jwt;
    }

const parseTokens = (tokensB64) => {
        let tokenDecoded = decodeBase64Token(tokensB64);
        let idToken = decodeTokenToJWT(tokenDecoded.id_token);
        console.log(idToken);
        
        let userObject = {
            authenticated: true,
            name: idToken.name || idToken.email,
            id: idToken.sub
        };
        
        return {
            token: tokenDecoded,
            idToken: idToken,
            user: userObject,
            refresh_token: tokenDecoded.refresh_token
        };
    }


module.exports = {
    decodeBase64Token,
    decodeTokenToJWT,
    parseTokens
};