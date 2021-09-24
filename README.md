# Remootio API Client for Node.js

This module is a Node.js client for Remootio's websocket API. Remootio is a smart gate and garage door controller product. To learn more please visit www.remootio.com. The API documentation can be found [here]( https://github.com/remootio/remootio-api-documentation ). The API client package handles the connection with your Remootio device, sends keepalive PING frame, encrypts and decrypts ENCRYPTED frames automatically, and can also reconnect automatically if the connection is lost.

### Installation

Install the package using npm:
```
npm install remootio-api-client
```

### Usage
First of all make sure that the Remootio Websocket API is enabled for your Remootio device in the Remootio app. Please take note of the API Secret key and API Auth Key along with the IP address of the device, as you will need these.

##### Step 1
Import the module by
```javascript
const RemootioDevice = require('remootio-api-client');
```
Create a RemootioDevice object that represents a physical Remootio device by:
```javascript
let garagedoor1 = new RemootioDevice(
    '192.168.1.23', //Device IP address
    'EFD0E4BF75D49BDD4F5CD5492D55C92FE96040E9CD74BED9F19ACA2658EA0FA9', //API Secret Key
    '7B456E7AE95E55F714E2270983C33360514DAD96C93AE1990AFE35FD5BF00A72', //API Auth Key
    )
//Constructor arguments:
//The IP address of the device is available in the Remootio app once you set up Wi-Fi connectivity
//The API Secret Key of the device is available in the Remootio app once you enable API access
//The API Auth Key of the device is available in the Remootio app once you enable API access
//Optional parameter here is how often the RemootioDevice class will send PING frames to the device to keep the connection alive (defaults to 60 seconds)    
```

##### Step 2 - Add event listeners
The Remootio device emits various events. Add listeners to the events you need to:

The connecting event is called when the API client starts connecting to the Remootio device
```javascript
garagedoor1.on('connecting',()=>{
    console.log('garage door 1 connecting ...')
})
```

The conencted event is called when the websocket connection is established with the Remootio device.
You need to authenticate each session (connection) to be able to control your Remootio device or receive log events. This can be done using the `.authenticate()` method. It is recommended to call this in the connected event handler.
```javascript
garagedoor1.on('connected',()=>{
    console.log('garage door 1 connected')
    garagedoor1.authenticate() //Authenticate the session (required)
})
```

The authenticated event is fired once the authentication was completed successfully. From this point on actions that require authentication can be sent to Remootio.
```javascript
garagedoor1.on('authenticated',()=>{
    console.log('garage door 1 session authenticated')
    //From this point on actions (that require authentication) can be sent to Remootio
    //garagedoor1.sendQuery()
    //garagedoor1.sendTrigger()
    //garagedoor1.sendOpen()
    //garagedoor1.sendClose()
    //garagedoor1.sendRestart()
})
```

The disconnect event is fired if the websocket connection to Remootio is closed
```javascript
garagedoor1.on('disconnect',()=>{
    console.log('garage door 1 disconnected')
})
```

The error event is fired if there was an error (e.g. the authentication process failed, there was an encryption error, and so on). If there is no response to a keepalive PING the connection is considered to be broken, and this will also fire an error event.
```javascript
garagedoor1.on('error',(err)=>{
    console.log('error',err)
})
```

The incomingmessage event is fired for every incoming frame. Add your own code to process the messages here.
Updating the lastActionId (a frame coutner needed to be incremented to every action sent to the Remootio device) is handled inside the RemootioDevice class.
```javascript
garagedoor1.on('incomingmessage',(frame,decryptedPayload)=>{
    //log the incoming messages to the console
    console.log('Incoming message: ',frame)
    if (decryptedPayload){
        console.log('Decrypted payload: ',decryptedPayload)
    }
    //messages can be handled here:
    //use frame.type to determine the frame type
    //if frame.type == "ENCRYPTED": 
    //then if decryptedPayload.response!=undefined it's a reponse message to an action sent previously
    //and if decryptedPayload.event!=undefined it's a log message e.g. gate status changed
})
```

The outgoingmessage event is fired for every frame the API client has sent.
```javascript
garagedoor1.on('outgoingmessage',(frame, unencryptedPayload)=>{
    console.log('Outgoing message: ',frame)
    if (unencryptedPayload){
        console.log('Unencrypted payload: ',unencryptedPayload)
    }
})
```

##### Step 3 - connect to the API
After you have created your device, added the necessary event listeners call the `.connect()` method to start connecting to your Remootio.

```javascript
garagedoor1.connect(true) 
//if the parameter is true the client will try to reconnect to the Remootio device if the connection is lost (recommended)
```

##### Sending frames to Remootio

The RemootioDevice class provides the following methods to send frames
 - `.sendPing()` - sends a PING frame
 - `.sendHello()` - sends a HELLO frame (the response is a SERVER_HELLO frame that contains the API version of your device)
 - `.authenticate()` - handles the complete authentication flow. You MUST call this method and wait for the `'authenticated'` event before sending any of the actions listed below:
 - `.sendQuery()` - sends a QUERY action. The response frame to the action contains the status of the gate or garage door ("open"/"closed"/"no sensor")
 - `.sendTrigger()` - Triggers the control output of the Remootio device to operate your gate or garage door
 - `.sendOpen()` - Opens your gate or garage door (triggers the control output of Remootio if the gate status is "closed")
 - `.sendClose()` - Closes your gate or garage door (triggers the control output of Remootio if the gate status is "open")
 - `.sendRestart()` - Restarts your Remootio device.
 - `.holdTriggerOutputActive(durationMins)` - Holds the control output which would be triggered by sendTrigger active for durationMins minutes
 - `.holdTriggerSecondaryOutputActive(durationMins)` - Holds the control output which would be triggered by sendTriggerSecondary active for durationMins minutes
 - `.holdOpenOutputActive(durationMins)` - Holds the control output which would be triggered by sendOpen active for durationMins minutes
 - `.holdCloseOutputActive(durationMins)` - Holds the control output which would be triggered by sendClose active for durationMins minutes

##### Checking the status of the device

The RemootioDevice class provides the following properties to check the current status of the connection to your Remootio:
 - `.isConnected` - if the API client is connected to Remootio or not
 - `.isAuthenticated` - if the current session (connection) is authenticated or not

##### Disconnecting
Call the `.disconnect()` method of the RemootioDevice class to close the current connection to your Remootio device.

### Example 1 - Trigger Remootio's output
This example:
 - Connects to your Remootio device
 - Triggers the control output
 - Waits for a StateChange event (that is fired when your gate or garage door's status is changed)
 - Closes the connection

```javascript
//Include the RemootioDevice module
const RemootioDevice = require('remootio-api-client')

//1) - Create a new instance for each Remootio device you have:
let garagedoor1 = new RemootioDevice(
    '192.168.1.115', //Change to the IP address of your device
    'EFD0E4BF75D49BDD4F5CD5492D55C92FE96040E9CD74BED9F19ACA2658EA0FA9', //Change to the API Secret Key of your device
    '7B456E7AE95E55F714E2270983C33360514DAD96C93AE1990AFE35FD5BF00A72', //Change to API Auth Key of your device
    )

//2) - Add listeners to various events:
garagedoor1.on('connected',()=>{
    console.log('garage door 1 connected')
    garagedoor1.authenticate()
})

garagedoor1.on('authenticated',()=>{
    console.log('garage door 1 session authenticated')
    garagedoor1.sendTrigger()
})

garagedoor1.on('error',(err)=>{
    console.log('error',err)
})

garagedoor1.on('disconnect',(err)=>{
    process.exit(0)
})

//The incomingmessage event is fired for every incoming frame
garagedoor1.on('incomingmessage',(frame,decryptedPayload)=>{
    //log the incoming messages to the console
    if (decryptedPayload){
        if (decryptedPayload.response != undefined){ //It's a response frame to one of our previous actions
            if (decryptedPayload.response.type == 'TRIGGER'){ //This is the response frame to the .sendTrigger() action
                console.log('The trigger action was '+(decryptedPayload.response.success == true?"successful":"not successful"))
                console.log('The status of the garage door when triggering was: '+(decryptedPayload.response.state))
                if (decryptedPayload.response.state == "no sensor"){
                    console.log('Since there is no sensor installed for the garage door we will not get any StateChange event, so we just disconnect now.')
                    console.log('Disconnecting...')
                    garagedoor1.disconnect()
                }
            }
        }
        if (decryptedPayload.event != undefined){ //It's an event frame containing a log entry from Remootio
            if (decryptedPayload.event.type == 'StateChange'){ //This event is sent by Remootio when the status of the garage door has changed
                console.log('The state of the garage door has changed to '+decryptedPayload.event.state);
                console.log('Disconnecting...')
                garagedoor1.disconnect()
            }
        }
    }
})

//Connect to the API
garagedoor1.connect(true)
```

Example output of the code:
garage door 1 connected
garage door 1 session authenticated
The trigger action was successful
The status of the garage door when triggering was: open
The state of the garage door has changed to closed
Disconnecting...

### Example 2 - Log events from Remootio into a file
This example: 
 - Connects to the Remootio device
 - Authenticates the session
 - Logs all event messages coming from Remootio into remootiolog.txt

```javascript
//Include the RemootioDevice module
const RemootioDevice = require('remootio-api-client')
const fs = require('fs');

const logFileName = './remootiolog.txt'

//1) - Create a new instance for each Remootio device you have:
let garagedoor1 = new RemootioDevice(
    '192.168.1.115', //Change to the IP address of your device
    'EFD0E4BF75D49BDD4F5CD5492D55C92FE96040E9CD74BED9F19ACA2658EA0FA9', //Change to the API Secret Key of your device
    '7B456E7AE95E55F714E2270983C33360514DAD96C93AE1990AFE35FD5BF00A72', //Change to API Auth Key of your device
    )

//2) - Add listeners to various events:
garagedoor1.on('connected',()=>{
    console.log('garage door 1 connected')
    garagedoor1.authenticate()
})

garagedoor1.on('authenticated',()=>{
    console.log('garage door 1 session authenticated')
})

garagedoor1.on('error',(err)=>{
    console.log('error',err)
})

//The incomingmessage event is fired for every incoming frame
garagedoor1.on('incomingmessage',(frame,decryptedPayload)=>{
    //log the incoming messages to the console
    if (decryptedPayload){
        //We are interested in events 
        if (decryptedPayload.event != undefined){ //It's an event frame containing a log entry from Remootio
            let rowToLog = new Date().toISOString() + ' ' + JSON.stringify(decryptedPayload) + '\r\n'
            console.log(rowToLog)
            fs.appendFile(logFileName, rowToLog, function (err) {
                if (err) console.log('ERROR: ', err);
            });
        }
    }
})

//Connect to the API
garagedoor1.connect(true)
```





