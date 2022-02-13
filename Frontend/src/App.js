import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

import Authentication from './Authentication';

let mockOAuthConfig = {
    clientId: "12345",
    "scopes": [
        "openid",
        "profile",
        "email",
    ],
    host: "cognito domain goes here",
};

const auth = new Authentication(mockOAuthConfig);

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      user: null
    }

    auth.onLogin((user) => {
      console.log("Logged in", user);
      this.setState({ user });
    });
  }


  login() {
    auth.login();
  }

  logout() {
    this.setState({ user: null });
    auth.logout();
  }

  render() {
    let loginStuff = null;

    if(this.state.user) {
      loginStuff = <div>Hi {this.state.user.name}<button onClick={this.logout}>Logout</button></div>
    } else {
      loginStuff = ( <div><button onClick={this.login}>Login</button></div> );
    }


    return (
      <div className="App">
        <div className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h2>Welcome to React</h2>
        </div>
        <p className="App-intro">
          To get started, edit <code>src/App.js</code> and save to reload.
        </p>
        { loginStuff }
      </div>
    );
  }
}

export default App;
