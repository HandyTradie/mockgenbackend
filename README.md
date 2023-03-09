
# MOCK GENERATOR BACKEND

This is the backend repository for the Mock Generator Project

## Getting Started

This repository contains the resources and instructions that will get you a copy of the project up and running on your local machine for development and testing purposes, and also with notes on how to deploy the project on a live system.

### Prerequisites

To get the project started, there are some tools you need to install on your local machine. The list of tools you need to install have been provided with a guide on how to install these tools.

##### `Install git`

For users on Mac, the best way to install git is by using [Homebrew](https://brew.sh/). To install Homebrew, open your shell and run the following command:

```
$ /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After the command is done running, check if Homebrew is successfully installed by running:

```
$ brew --version
```

If Homebrew is successfully installed, the version will be logged to the screen. Now proceed to install git using Homebrew with the following command:

```
$ brew install git
```

For users on Windows, download the [latest version](https://git-scm.com/downloads) of Git and choose the 64/32 bit version. After the file is downloaded, install it in the system. Once installed, select Launch the Git Bash, then click on finish. After that, check for a successful installation by opening your terminal and logging the version of git with:

```
$ git --version
```

##### `Install Node.js`

For users on Mac, install Node.js with Homebrew using the following command:

```
$ brew update
$ brew install node
```

For users on Windows, download and install the [Node.js](https://nodejs.org/en/download/) .msi installer. Follow the guide on the installer and node.js should be installed successfully on your local machine. After that, check for a successful installation by logging the version of Node.js with:

```
$ node --version
```

This project also uses google firebase cloud functions and therefore, we need to have the firebase cli installed.

##### `Install firebase-cli`

```
$ npm install -g firebase-tools
```

Check for a successful installation by running:

```
$ firebase --version
```

### Installation

Now that you have installed the tools required to start the project locally, we provide a step by step instructions that tell you how to get a development environment running. Before you can get the dev environment running, you need to download the project resources (files) from the github repository using git (which you installed earlier). To do this, you simply need to run the following command:

```
$ git clone https://github.com/ecoachlabs/examgenbackend.git
```

After git is done cloning the project repository, move into the project folder and install the dependencies:

```
$ cd examgenbackend
$ npm install -g yarn    // project uses yarn
$ yarn install        // or simply "yarn"
```

You then have to move into the ```functions``` folder and install the other dependencies:

```
$ cd functions
$ yarn install
```

Now start the development server to initialize your cloud functions locally with the following command:

```
$ firebase emulators:start
```

## Deployment

To deploy your functions to the firebase cloud, run the following command:

```
$ firebase deploy --only functions
```
