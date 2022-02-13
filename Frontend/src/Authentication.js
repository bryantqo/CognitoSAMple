import { parseTokens } from './JWTUtil';

const nullUser = { authenticated: false, name: '' };

class Authentication {

    // Our constrructor takes a configuration object
    constructor(config) {  
        let res, rej;

        let pro = new Promise((resolve, reject) => {
            res = resolve;
            rej = reject;
        });


        this.state = {
            user: { authenticated: false, name: '', acls: [] },
            oAuthConfig: config,
            oAuthState: {},
            promise: pro,
            resolve: res,
            reject: rej

        }

        // Attempt to get our refresh token from session storage
        let storedRefreshToken = this.getRefreshTokenFromSession();

        // If we have a refresh token, then we can attempt to use it to get a new access token
        if(storedRefreshToken) {
            this.refreshToken(storedRefreshToken);
        }
    }

    setState(state) {
        this.state = { ...this.state, ...state };
    }

    /*
        * This function will attempt to get the refresh token from session storage
        * When we authenticate, if we are given a refresh token, we will store it in session storage
        * This way we can use it to get a new access token when the page is reloaded or the user navigates to a new page
    */
    getRefreshTokenFromSession() {
        try
        {
            let session = window.sessionStorage.getItem('refreshToken');
            if(session) {
                return JSON.parse(session);
            }
        }
        catch(ex){}
        return null;
    }

    /*
        * This function will store the refresh token in session storage
        * Later on we can retrieve it and use it to get a new access token
    */
    setRefreshTokenInSession(refreshToken) {
        window.sessionStorage.setItem('refreshToken', JSON.stringify(refreshToken));
    }

    /*
        * This function will clear the refresh token from session storage
    */
    clearRefreshTokenInSession() {
        window.sessionStorage.removeItem('refreshToken');
    }

    /*
        * This function will handle the logoout process
        * The first step is to open the logout endpoint in a new tab
        * On the server side any session or cookie information should be cleared
        * Then it will redirect to our backend to finalize the logout on our side
    */
    logout = async () => {

        this.clearRefreshTokenInSession();
        
        // Calculate our redirect url based off of the origin of the current page and the logout endpoint in our api
        let redirect = window.location.origin + '/api/oauth/logout';

        // Open the logout endpoint in a new tab
        let fetchUrl = `https://${this.state.oAuthConfig.host}/logout?client_id=${this.state.oAuthConfig.clientId}&logout_uri=${redirect}`;

        
        let windowRef = window.open(fetchUrl, '_blank');
        
        // Keep a reference to the window so we can close it later if needed
        this.setState({windowRef});

        this.setState({ user: nullUser });

        return this.state.promise;
    }

    /*
        * This function returns true if the user is authenticated
    */
    isSignedIn = () => {
        return this.state.user.authenticated;
    }

    /*
        * This function returns the curent user
    */
    getUser = () => {
        return this.state.user;
    }
    
    /*
        * This function handles messages posted to the window
        * We expect the message to come from the same origin
        * We then make sure that the event type is 'oauth-token'
    */
    handleMessage = (event) => {
        
        if (event.origin !== window.location.origin) {
            return;
        }

        if (event.data.type === 'oauth-token') {
            // Parse the tokens from the message and store them in the state
            this.parseTokenAndUpdateState(event.data.token);
        }
    }

    /*
        * This function allows outside code to register a callback to be called when the user is authenticated
        * If multiple callbacks are registered, they will be called in the order they were registered
    */
    onLogin = (fn) => {
        let resolvers = this.state.resolvers || [];
        resolvers.push(fn);
        this.setState({ resolvers });
    }

    /*
        * This is called when a login is successful
        * It will call all of the registered callbacks
    */
    resolveLogin = (user) => {
        if(this.state.resolvers)
        {
            this.state.resolvers.forEach(fn => {
                fn(user);
            });
        }
    }

    parseTokenAndUpdateState = (tokenData) => {
        let { token, idToken, user, refresh_token } = parseTokens(tokenData);

        if(refresh_token)
            this.setRefreshTokenInSession(refresh_token);

        this.setState({ token, idToken, user, bearerToken: token.access_token });

        this.resolveLogin(user);

        /*
            This is a bear to remind us to set the bearer token in subsiquent api calls that need to be authenticated
            https://en.wikipedia.org/wiki/Joan_Stark

  _,-""`""-~`)
(`~_,=========\
 |---,___.-.__,\
 |        o     \ ___  _,,,,_     _.--.
  \      `^`    /`_.-"~      `~-;`     \
   \_      _  .'                 `,     |
     |`-                           \'__/ 
    /                      ,_       \  `'-. 
   /    .-""~~--.            `"-,   ;_    /
  |              \               \  | `""`
   \__.--'`"-.   /_               |'
              `"`  `~~~---..,     |
 jgs                         \ _.-'`-.
                              \       \
                               '.     /
                                 `"~"`
        */
    }
    
    /*
        * This function is called to start the login process
        * It will open the login endpoint in a new tab
    */
    login = async () => {

        // Do not allow this to be called if the protocol is not https
        if(window.location.protocol !== "https:") {
            console.error("Only fools would try to use http");
            return false;
        }

        // Calculate our redirect url based off of the origin of the current page and the login endpoint in our api
        let redirect = window.location.origin + '/api/oauth/callback';

        let fetchUrl = `https://${this.state.oAuthConfig.host}/oauth2/authorize?response_type=code&client_id=${this.state.oAuthConfig.clientId}&redirect_uri=${redirect}`;
        
        // Add our listener to the window
        window.addEventListener('message', this.handleMessage);

        // Open the login endpoint in a new tab
        let windowRef = window.open(fetchUrl, '_blank');

        // Keep a reference to the window so we can close it later if needed
        this.setState({windowRef});

        return this.state.promise;
        

    }

    /*
        * This function is called to get a new access token from the refresh token
    */
    refreshToken = async (refreshToken) => {
        console.log("Refreshing token");
        let fetchUrl = window.location.origin + '/api/oauth/refresh';

        try
        {
            let response = await fetch(fetchUrl, {
                method: 'POST',
                redirect: 'manual',
                cors: 'no-cors',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${refreshToken}`
                },
                body: `${refreshToken}`
            });
               
            if (response.status === 200) {
                let responseJson = await response.json();
                console.log("Refreshed token", responseJson);
                this.parseTokenAndUpdateState(responseJson.token);

                if(responseJson.acls)
                    this.updatePermissions(responseJson.acls)
            }
            else {
                console.error(`Failed to refresh token: ${response.status}`);
            }
        }
        
        catch(ex)
        {
            console.error(`Failed to refresh token: ${ex}`);
        }
    }

}


export default Authentication;