# Cognito SAMple Project

This project is broken up into 3 main seactions: Frontend, Backend, and Infrastructure.

## Frontend
The frontend project is written in javascrip utilizing React as the framework. React was chosen just to get it off the ground quick and is in no means a requirement. The main point of interes is going to be the Authentication.js file. More details about this portion can be found in the README in that folder.

## Backend
The backend portion of the project is written in javascript for nodejs 14.x. It leverages fetch to communicate with the Cognito api in an agnostic fashion. Additionally it uses the jsonwebtoken and jwt-to-pem libraries to verify the tokens provided. This could could probably be adapted to use any oAuth/OpenID server as long as you are able to retreive the public keys.

## Infrastructure
This folder holds templates used by sam for the solution. The template is broken into three pieces to better reflect how I like to organize my projects.

---

## Project requirements
AWS SAM
AWS CLI
Nodejs 14.x
Cognito user pool


## Local development
In the Infrastructure folder run `sam build` to build the backend. This will run through the template transformations and build the backend. Open up the local.env file and populate the COGNITO_DOMAIN value with the domain that your pool resides. You can then start the backend by running `sam build && sam local start-api -p 3001 -n local.env`  
In the frontend folder run `npm i` to install project dependencies. After that has finished run `HTTPS=true npm start` to launch the dev server. If configured, your browser should open a tab to https://localhost:3000. Note that in theory you could use http for development but you will need to modify Authenitcation.js to not explicitly block it.

