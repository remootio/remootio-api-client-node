import WebSocket = require('ws');
import {EventEmitter} from 'events';
import * as apicrypto from './apicrypto';
import {
  ReceivedEncryptedFrameContent,
  ReceivedFrames,
  RemootioAction,
  SentEcryptedFrameContent,
  SentFrames,
} from './frames';

/**
 * RemootioDevice class implements an API client for a signle device. You should create one instance per Remootio device you have.
 * The class takes care of keeping the connection alive by sending a PING message every sendPingMessageEveryXMs milliseconds to the Remootio device.
 * If no response is received within pingReplyTimeoutXMs=(sendPingMessageEveryXMs/2) time after a PING message, the connection is assumed to be broken.
 *
 * *** Constructor ***
 * The constructor takes 3 parameters: DeviceIp, ApiSecretKey, ApiAuthKey (all of them are available in the Remootio app)
 * @param {string} DeviceIp - the IP address of the Remootio device (this info is available in the Remootio app)
 * @param {string} ApiSecretKey - the API Secret Key of the Remootio device (this info is available in the Remootio app)
 * @param {string} ApiAuthKey - the API Auth Key of the Remootio device (this info is available in the Remootio app)
 * @param {string} [sendPingMessageEveryXMs=60000] - the API client sends a ping frame to the Remootio device every sendPingMessageEveryXMs milliseconds to keep the connection alive. Remootio closes the connection if no message is received for 120 seconds. If no message is received from Remootio within (sendPingMessageEveryXMs/2) milliseconds after PING frame is sent the API client considers the connection to be broken and closes it. It's not recommended to set sendPingMessageEveryXMs below 10000 (10 seconds).
 *
 * *** Properties ***
 * @property isConnected - shows if the API client is connected to the Remootio device's websocket API or not
 * @property isAuthenticated - shows if the API client is connected to the Remootio device's websocket API or not
 * @property theLastActionId - gets the id of the last action sent to the Remootio API (lastActionId), any new action sent should contain the incremented value of the the last action id modulo 0x7FFFFFFF. Incrementing this value is handled automatically by the RamootioDevice class. The only time you need this property if you want to send an arbitrary ENCRYPED frame using sendEncryptedFrame()
 *
 * *** Methods ****
 * @method connect(autoReconnect) - connect the API client to the Remootio device (via websocket)
 * @param {boolean} autoReconnect - the API client will try to reconnect to the Remootio device when the connection is lost
 *
 * @method disconnect() - disconnect the API client from the Remootio device
 *
 * @method authenticate() - authenticates the client with the Remootio API by first sending an AUTH frame, and then sending a QUERY action as a response to the authentication challenge from the server
 *
 * @method sendPing() - send a PING frame
 *
 * @method sendHello() - send a HELLO frame
 *
 * @method sendQuery() - send a QUERY action //needs authentication
 *
 * @method sendTrigger() - send a TRIGGER action //needs authentication
 *
 * @method sendTriggerSecondary() - send a TRIGGER_SECONDARY action //needs authentication
 *
 * @method sendOpen() - send a OPEN action //needs authentication
 *
 * @method sendClose() - send a CLOSE action //needs authentication
 *
 * @method holdTriggerOutputActive(durationMins) Holds the output triggered by the sendTrigger command active for durationMins
 *
 * @method holdTriggerSecondaryOutputActive(durationMins) Holds the secondary output triggered by the sendTriggerSecondary command active for durationMins
 *
 * @method holdOpenOutputActive(durationMins) Holds the output triggered by the sendOpen command active for durationMins
 *
 * @method holdCloseOutputActive(durationMins) Holds the output triggered by the sendClose command active for durationMins
 *
 * @method sendRestart() - send a RESTART action //needs authentication
 *
 * @method sendFrame(frame) - send a normal frame the sendPing and sendHello and authenticate functions above use this
 *
 * @method sendEncryptedFrame(unencryptedPayload) - send an encrypted frame the sendQuery, sendTrigger, sendOpen, sendClose, sendRestart functions use this
 *
 * *** Events ***
 * The class emits the following events:
 * @event connecting - when it tries to connect
 *
 * @event connected - when it is connected
 *
 * @event authenticated - when the authentication flow is finished (the client receives a response to his first QUERY action after the AUTH message)
 *
 * @event disconnect - when the connection is lost
 *
 * @event error - if there is any error
 *
 * @event outgoingmessage - the event is emitted whenever a message is sent to the API with the following two parameters
 * @param {Object} frame - contains the javascript object of the JSON frame
 * @param {Object} unencryptedPayload - contains the javascript object of the unencrypted payload (frame.data.payload) if it's an ENCRYPTED frame
 *
 * @event incomingmessage - the event is emitted whenever a message is received from the Remootio device with the following two parameters
 * @param {Object} frame - contains the javascript object of the JSON frame received
 * @param {Object} decryptedPayload - contains the javascript object of the decrypted payload (frame.data.payload) if it's an ENCRYPTED frame
 *
 */

interface RemootioDeviceEvents {
  connecting: () => void;
  connected: () => void;
  authenticated: () => void;
  disconnect: () => void;
  error: (errorMessage: string) => void;
  debug: (debugMessage: string) => void;
  outgoingmessage: (
    frame?: SentFrames,
    unencryptedPayload?: SentEcryptedFrameContent
  ) => void;
  incomingmessage: (
    frame: ReceivedFrames,
    decryptedPayload?: ReceivedEncryptedFrameContent
  ) => void;
}

declare interface RemootioDevice {
  on<E extends keyof RemootioDeviceEvents>(
    event: E,
    listener: RemootioDeviceEvents[E]
  ): this;
  emit<E extends keyof RemootioDeviceEvents>(
    event: E,
    ...args: Parameters<RemootioDeviceEvents[E]>
  ): boolean;
}

class RemootioDevice extends EventEmitter {
  private apiSecretKey: string;
  private apiAuthKey: string;
  private deviceIp: string;
  private websocketClient?: WebSocket;
  private apiSessionKey?: string;
  private lastActionId?: number;
  private autoReconnect: boolean;
  private sendPingMessageEveryXMs: number;
  private sendPingMessageIntervalHandle?: ReturnType<typeof setInterval>;
  private pingReplyTimeoutXMs: number;
  private pingReplyTimeoutHandle?: ReturnType<typeof setTimeout>;
  private waitingForAuthenticationQueryActionResponse?: boolean;

  /**
   * Constructor to create a RemootioDevice instance. You should create one instance per Remootio device you have.
   * @param {string} DeviceIp - ip address of the device (as seen in the Remootio app) e.g. "192.168.1.155"
   * @param {string} ApiSecretKey - API Secret Key of the device (as seen in the Remootio app). It is a hexstring representing a 256 bit long value e.g. "12b3f03211c384736b8a1906635f4abc90074e680138a689caf03485a971efb3"
   * @param {string} ApiAuthKey - API Auth Key of the device (as seen in the Remootio app). It is a hexstring representing a 256 bit long value e.g. "74ca13b56b3c898670a67e8f36f8b8a61340738c82617ba1398ae7ca62f1670a"
   * @param {number} [sendPingMessageEveryXMs=60000] - the API client sends a ping frame to the Remootio device every sendPingMessageEveryXMs milliseconds to keep the connection alive. Remootio closes the connection if no message is received for 120 seconds. If no message is received from Remootio within (sendPingMessageEveryXMs/2) milliseconds after PING frame is sent the API client considers the connection to be broken and closes it. It's not recommended to set sendPingMessageEveryXMs below 10000 (10 seconds).
   */
  constructor(
      DeviceIp: string,
      ApiSecretKey: string,
      ApiAuthKey: string,
      sendPingMessageEveryXMs?: number,
  ) {
    super();
    // Input check
    let hexstringRe = /[0-9A-Fa-f]{64}/g;
    if (!hexstringRe.test(ApiSecretKey)) {
      this.emit('error',
          'ApiSecretKey must be a hexstring representing a 256bit long byteArray',
      );
    }
    hexstringRe = /[0-9A-Fa-f]{64}/g;
    if (!hexstringRe.test(ApiAuthKey)) {
      this.emit('error',
          'ApiAuthKey must be a hexstring representing a 256bit long byteArray',
      );
    }
    // Set config
    this.apiSecretKey = ApiSecretKey;
    this.apiAuthKey = ApiAuthKey;
    this.deviceIp = DeviceIp;
    this.websocketClient = undefined;
    // Session related data - will be filled out by the code
    this.apiSessionKey = undefined; // base64 encoded
    this.lastActionId = undefined;

    this.autoReconnect = false; // Reconnect automatically if connection is lost

    if (sendPingMessageEveryXMs) {
      this.sendPingMessageEveryXMs = sendPingMessageEveryXMs; // in ms , send a ping message every PingMessagePeriodicity time, a PONG reply is expected
    } else {
      this.sendPingMessageEveryXMs = 60000;
    }

    this.sendPingMessageIntervalHandle = undefined; // we fire up a setInterval upon connection to the device to send ping messages every x seconds
    this.pingReplyTimeoutXMs = this.sendPingMessageEveryXMs / 2; // in ms, if a PONG frame (or any other frame) doesn't arrive pingReplyTimeoutXMs milliseconds after we send a PING frame, we assume the connection is broken
    this.pingReplyTimeoutHandle = undefined; // We check for pong response for all our ping messages, if they don't arrive we assume the connection is broken and close it
    this.waitingForAuthenticationQueryActionResponse = false; // needed to emit the 'authenticated' even on the successful response to the QUERY action sent in the authentication flow
  }

  /**
   * Connect to the Remootio device's websocket API
   * @param {boolean} autoReconnect - If autoReconnect is true, the API client will try to reconnect to the device everytime the connection is lost (recommended)
   */
  public connect(autoReconnect: boolean): void {
    if (autoReconnect == true) {
      this.autoReconnect = true;
    }

    // Set session data to NULL
    this.apiSessionKey = undefined;
    this.lastActionId = undefined;
    this.waitingForAuthenticationQueryActionResponse = undefined;

    // We connect to the API
    this.websocketClient = new WebSocket('ws://' + this.deviceIp + ':8080/');
    this.emit('connecting');

    this.websocketClient.on('open', () => {
      this.emit('connected');

      // We send a ping message every 60 seconds to keep the connection alive
      // If the Remootio API gets no message for 120 seconds, it closes the connection
      this.sendPingMessageIntervalHandle = setInterval(() => {
        if (this.websocketClient?.readyState == WebSocket.OPEN) {
          // Create a timeout that is cleared once a PONG message is received - if it doesn't arrive, we assume the connection is broken
          this.pingReplyTimeoutHandle = setTimeout(() => {
            this.emit(
                'error',
                'No response for PING message in ' +
                this.pingReplyTimeoutXMs +
                ' ms. Connection is broken.',
            );
            if (this.websocketClient) {
              this.websocketClient.terminate();
              this.pingReplyTimeoutHandle = undefined;
            }
          }, this.pingReplyTimeoutXMs);
          this.sendPing();
        }
      }, this.sendPingMessageEveryXMs);
    });

    this.websocketClient.on('message', (data) => {
      try {
        // We process the messsage received from the API
        const rcvMsgJson: ReceivedFrames = JSON.parse(data.toString()); // It must be JSON format

        // If we get any reply after our PING message (not only PONG) we clear the pingReplyTimeout
        if (this.pingReplyTimeoutHandle != undefined) {
          clearTimeout(this.pingReplyTimeoutHandle);
          this.pingReplyTimeoutHandle = undefined;
        }

        // we process the incoming frames
        if (rcvMsgJson && rcvMsgJson.type == 'ENCRYPTED') {
          // if it's an encrypted frame we decrypt it and then this.emit the event
          const decryptedPayload = apicrypto.remootioApiDecryptEncrypedFrame(
              rcvMsgJson,
              this.apiSecretKey,
              this.apiAuthKey,
              this.apiSessionKey,
          );
          // we this.emit the encrypted frames with decrypted payload
          this.emit('incomingmessage', rcvMsgJson, decryptedPayload);

          if (decryptedPayload != undefined) {
            if ('challenge' in decryptedPayload) {
              // If it's an auth challenge
              // It's a challenge message
              this.apiSessionKey = decryptedPayload.challenge.sessionKey; // we update the session key
              this.lastActionId = decryptedPayload.challenge.initialActionId; // and the actionId (frame counter for actions)

              this.waitingForAuthenticationQueryActionResponse = true;
              this.sendQuery();
            }

            if (
              'response' in decryptedPayload &&
              decryptedPayload.response.id != undefined
            ) {
              // If we get a response to one of our actions, we incremenet the last action id
              if (this.lastActionId != undefined) {
                if (
                  this.lastActionId < decryptedPayload.response.id || // But we only increment if the response.id is greater than the current counter value
                  (decryptedPayload.response.id == 0 &&
                    this.lastActionId == 0x7fffffff)
                ) {
                  // or when we overflow from 0x7FFFFFFF to 0
                  this.lastActionId = decryptedPayload.response.id; // We update the lastActionId
                }
              } else {
                this.emit('debug','onMessage: lastActionId is undefined');
              }

              // if it's the response to our QUERY action sent during the authentication flow the 'authenticated' event should be emitted
              if (
                decryptedPayload.response.type == 'QUERY' &&
                this.waitingForAuthenticationQueryActionResponse == true
              ) {
                this.waitingForAuthenticationQueryActionResponse = false;
                this.emit('authenticated');
              }
            }
          } else {
            this.emit('error', 'Authentication or encryption error');
          }
        } else {
          // we this.emit the normal frames
          this.emit('incomingmessage', rcvMsgJson, undefined);
        }
      } catch (e) {
        if (e instanceof Error) {
          this.emit('error', e.message);
        }
      }
    });

    this.websocketClient.on('close', () => {
      // Clear the ping message interval if the connection is lost
      if (this.sendPingMessageIntervalHandle != undefined) {
        clearInterval(this.sendPingMessageIntervalHandle);
        this.sendPingMessageIntervalHandle = undefined;
      }

      if (this.autoReconnect == true) {
        this.connect(this.autoReconnect);
      }

      this.emit('disconnect');
    });

    this.websocketClient.on('error', (err) => {
      // Connection error
      this.emit('debug', err.message);
    });
  }

  /**
   * Disconnect from the Remootio device's websocket API
   * it sents autoConnect to false, so even if you have enabled it in your connect method it will not reconnect automatically.
   */
  disconnect(): void {
    if (this.websocketClient != undefined) {
      this.autoReconnect = false; // We disable autoreconnect if we disconnect due to user will
      this.websocketClient.close();
    }
  }

  /**
   * Sends an arbitrary frame to the Remootio device's websocket API
   * @param {Object} frameJson - Is a javascript object that will be stringified and sent to the Remootio API. A valid frameJson example for the HELLO frame is:
   * {
   *     type:"HELLO"
   * }
   */
  sendFrame(frameJson: SentFrames): void {
    if (
      this.websocketClient != undefined &&
      this.websocketClient.readyState == WebSocket.OPEN
    ) {
      this.websocketClient.send(JSON.stringify(frameJson));
      this.emit('outgoingmessage', frameJson, undefined);
    } else {
      this.emit('debug','The websocket client is not connected');
    }
  }

  /**
   * Sends an ENCRYPTED frame with an arbitrary payload to the Remootio device's websocket API
   * @param {Object} unencryptedPayload - Is a javascript object that will be encrypted and placed into the ENCRYPTED frame's frame.data.payload. An example for a QUERY action is:
   * {
   *     action:{
   *         type:"QUERY",
   *         lastActionId = 321
   *     }
   * } where lastActionId must be an increment modulo 0x7FFFFFFF of the last action id (you can get this using the lastActionId property of the RemootioDevice class)
   */
  sendEncryptedFrame(unencryptedPayload: RemootioAction): void {
    if (
      this.websocketClient != undefined &&
      this.websocketClient.readyState == WebSocket.OPEN
    ) {
      if (this.apiSessionKey != undefined) {
        // Upon connecting, send the AUTH frame immediately to authenticate the session
        const encryptedFrame = apicrypto.remootioApiConstructEncrypedFrame(
            JSON.stringify(unencryptedPayload),
            this.apiSecretKey,
            this.apiAuthKey,
            this.apiSessionKey,
        );
        this.websocketClient.send(JSON.stringify(encryptedFrame));
        this.emit('outgoingmessage', encryptedFrame, unencryptedPayload);
      } else {
        this.emit('debug','sendEncryptedFrame: Authenticate session first to send this message');
      }
    } else {
      this.emit('debug','The websocket client is not connected');
    }
  }

  /**
   * Handles the authentication flow. It sends an AUTH frame, and then extracts the sessionKey and initialActionId from the response, then swaps the encryption keys
   * to the sessionKey and performs a valid QUERY action to finish the authentication successfully.
   */
  authenticate(): void {
    this.sendFrame({
      type: 'AUTH',
    });
  }

  /**
   * Sends a HELLO frame to the Remootio device API. The expected response is a SERVER_HELLO frame
   */
  sendHello(): void {
    this.sendFrame({
      type: 'HELLO',
    });
  }

  /**
   * Sends a PING frame to the Remootio device API. The expected response is a PONG frame. The RemootioDevice class sends periodic PING frames automatically to keep the connection alive.
   */
  sendPing(): void {
    this.sendFrame({
      type: 'PING',
    });
  }

  /**
   * Sends a QUERY action in an ENCRYPTED frame to the Remootio device API.
   * The response ENCRYPTED frame contains the gate status (open/closed)
   */
  sendQuery(): void {
    if (this.lastActionId != undefined) {
      this.sendEncryptedFrame({
        action: {
          type: 'QUERY',
          id: (this.lastActionId + 1) % 0x7fffffff, // set frame counter to be last frame id + 1
        },
      });
    } else {
      this.emit('debug','sendQuery: lastActionId is undefined');
    }
  }

  /**
   * Sends a TRIGGER action in an ENCRYPTED frame to the Remootio device API.
   * This action triggers the output of the Remootio device. (so it opens/closes your gate or garage door depending on how your gate or garage door opener is set up)
   */
  sendTrigger(): void {
    if (this.lastActionId != undefined) {
      this.sendEncryptedFrame({
        action: {
          type: 'TRIGGER',
          id: (this.lastActionId + 1) % 0x7fffffff, // set frame counter to be last frame id + 1
        },
      });
    } else {
      this.emit('debug','sendTrigger: lastActionId is undefined');
    }
  }

  /**
   * Sends a TRIGGER_SECONDARY action in an ENCRYPTED frame to the Remootio device API.
   * The action requires you to have a Remootio 2 device with one control output configured to be a "free relay output"
   * This action triggers the free relay output of the Remootio device.
   * Only supported in API version 2 or above
   */
  sendTriggerSecondary(): void {
    if (this.lastActionId != undefined) {
      this.sendEncryptedFrame({
        action: {
          type: 'TRIGGER_SECONDARY',
          id: (this.lastActionId + 1) % 0x7fffffff, // set frame counter to be last frame id + 1
        },
      });
    } else {
      this.emit('debug','sendTriggerSecondary: lastActionId is undefined');
    }
  }

  /**
   * Sends an OPEN action in an ENCRYPTED frame to the Remootio device API.
   * This action triggers the output of the Remootio device to open the gate or garage door only if the gate or garage door is currently closed.
   * This action returns an error response if there is no gate status sensor installed.
   */
  sendOpen(): void {
    if (this.lastActionId != undefined) {
      this.sendEncryptedFrame({
        action: {
          type: 'OPEN',
          id: (this.lastActionId + 1) % 0x7fffffff, // set frame counter to be last frame id + 1
        },
      });
    } else {
      this.emit('debug','sendOpen: lastActionId is undefined');
    }
  }

  /**
   * Sends an CLOSE action in an ENCRYPTED frame to the Remootio device API.
   * This action triggers the output of the Remootio device to close the gate or garage door only if the gate or garage door is currently open.
   * This action returns an error response if there is no gate status sensor installed.
   */
  sendClose(): void {
    if (this.lastActionId != undefined) {
      this.sendEncryptedFrame({
        action: {
          type: 'CLOSE',
          id: (this.lastActionId + 1) % 0x7fffffff, // set frame counter to be last frame id + 1
        },
      });
    } else {
      this.emit('debug','sendClose: lastActionId is undefined');
    }
  }

  /**
   * Sends a TRIGGER action with hold active duration in an ENCRYPTED frame to the Remootio device API.
   * This action triggers the output of the Remootio device and holds it active for the duration specified in minutes
   */
  holdTriggerOutputActive(durationMins: number): void {
    if (this.lastActionId != undefined) {
      this.sendEncryptedFrame({
        action: {
          type: 'TRIGGER',
          duration: durationMins,
          id: (this.lastActionId + 1) % 0x7fffffff, // set frame counter to be last frame id + 1
        },
      });
    } else {
      this.emit('debug','holdTriggerOutputActive: lastActionId is undefined');
    }
  }
  /**
   * Sends a TRIGGER_SECONDARY action with hold active duration in an ENCRYPTED frame to the Remootio device API.
   * This action triggers the secondary output of the Remootio device and holds it active for the duration specified in minutes
   */
  holdTriggerSecondaryOutputActive(durationMins: number): void {
    if (this.lastActionId != undefined) {
      this.sendEncryptedFrame({
        action: {
          type: 'TRIGGER_SECONDARY',
          duration: durationMins,
          id: (this.lastActionId + 1) % 0x7fffffff, // set frame counter to be last frame id + 1
        },
      });
    } else {
      this.emit('debug','holdTriggerSecondaryOutputActive: lastActionId is undefined');
    }
  }

  /**
   * Sends a OPEN action with hold active duration in an ENCRYPTED frame to the Remootio device API.
   * This action triggers the open direction output of the Remootio device and holds it active for the duration specified in minutes
   */
  holdOpenOutputActive(durationMins: number): void {
    if (this.lastActionId != undefined) {
      this.sendEncryptedFrame({
        action: {
          type: 'OPEN',
          duration: durationMins,
          id: (this.lastActionId + 1) % 0x7fffffff, // set frame counter to be last frame id + 1
        },
      });
    } else {
      this.emit('debug','holdOpenOutputActive: lastActionId is undefined');
    }
  }

  /**
   * Sends a CLOSE action with hold active duration in an ENCRYPTED frame to the Remootio device API.
   * This action triggers the close direction output of the Remootio device and holds it active for the duration specified in minutes
   */
  holdCloseOutputActive(durationMins: number): void {
    if (this.lastActionId != undefined) {
      this.sendEncryptedFrame({
        action: {
          type: 'CLOSE',
          duration: durationMins,
          id: (this.lastActionId + 1) % 0x7fffffff, // set frame counter to be last frame id + 1
        },
      });
    } else {
      this.emit('debug','holdCloseOutputActive: lastActionId is undefined');
    }
  }

  /**
   * Sends an RESTART action in an ENCRYPTED frame to the Remootio device API.
   * This action triggers a restart of the Remootio device.
   */
  sendRestart(): void {
    if (this.lastActionId != undefined) {
      this.sendEncryptedFrame({
        action: {
          type: 'RESTART',
          id: (this.lastActionId + 1) % 0x7fffffff, // set frame counter to be last frame id + 1
        },
      });
    } else {
      this.emit('debug','sendRestart: lastActionId is undefined');
    }
  }

  // Get method for the isConnected property
  get isConnected(): boolean {
    if (
      this.websocketClient != undefined &&
      this.websocketClient.readyState == WebSocket.OPEN
    ) {
      return true;
    } else {
      return false;
    }
  }

  // Get method for the lastActionId property
  get theLastActionId(): number | undefined {
    return this.lastActionId;
  }

  // Get method for the isAuthenticated property
  get isAuthenticated(): boolean {
    if (
      this.websocketClient != undefined &&
      this.websocketClient.readyState == WebSocket.OPEN
    ) {
      if (this.apiSessionKey != undefined) {
        // If the session is authenticated, the apiSessionKey must be defined
        return true;
      } else {
        return false;
      }
    } else {
      return false; // The connection cannot be authenticated if it's not even established
    }
  }
}

export = RemootioDevice;
