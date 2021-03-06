/* global Store */

import DDP from './../ddp/ddp'; // Import para autocomplete, classe vem instanciada como parâmetro no construtor
import {uniqueId} from "./../utils/unique-id";
import Base from './base';

export default class Guest extends Base {

  /**
   *
   * @param {DDP} ddp
   * @param {object} opts
   */
  constructor(ddp, opts) {
    super(opts.debug);

    this.token = opts.token;
    this.department = opts.department

    this.eventRegistered = 0;
    this.eventSentMessage = 0;

    this.registered = false;
    this.subscribed = false;

    this.ddp = ddp;
    this.name = opts.name;
    this.email = opts.email;
    this.chatId = opts.chatId;

    this.msgs = [];
    this.rid = uniqueId();
    this.data = '';

    this.host = opts.host;
    this.downloadURL = opts.downloadURL;

    this.firstMsg = true;

    this.register();
    this.listeningResult();
    this.subscribe();

    this.responses = [];
  }

  register() {
    super.log(`[DEBUG ]  Registering user as a guest on Rocket.Chat: { token: '${this.token}', name: '${this.name}', email: '${this.email}' }`);

    let params = {
      token: this.rid,
      name: this.name,
      email: this.email,
    };

    if (this.department) {
      params['department'] = this.department;
    }

    this.eventRegistered = this.ddp.method('livechat:registerGuest', [params]);
  }

  listeningResult() {
    this.ddp.on('result', message => {
      if (!message.error) {
        switch (message.id) {
          case this.eventRegistered:
            if (!this.registered) {
              super.log('[DEBUG ] Notifying registered user event\n', message);

              this.ddp.emit('registeredGuest', this.chatId, message);
              this.registered = true;
              this.data = message.result.visitor;

              this.subscribe();
            }
            break;

          case this.eventSentMessage:
            if (this.msgs.indexOf(message._id) == -1) {
              super.log('[DEBUG ] Notifying message event sent to Rocket.Chat\n', message);

              this.msgs.push(message._id);
              this.ddp.emit('msgSent', message);
            }
            break;
        }

      } else {
        console.log('[Error]', message);
      }
    });
  }

  subscribe() {
    this.ddp.on('msgSent', () => {
      if ( !this.subscribed ) {
        super.log(`[DEBUG ] Including client to guest's guestroom: RID: ${this.rid} CHATID: ${this.chatId}`);

        this.subscribed = true;
        this.ddp.sub('stream-room-messages', [this.rid, false]);
      }
    });
  }

  sendMsg(txtMsg) {
    super.log(`[DEBUG ] Sending message to Rocket.Chat: RID: ${this.rid} CHATID: ${this.chatId}\n`, txtMsg);

    const msgId = uniqueId();
    this.eventSentMessage = this.ddp.method('sendMessageLivechat', [{
      _id: msgId,
      rid: this.rid,
      msg: txtMsg,
      token: this.data.token,
    }]);
  }

  receiveResponse() {
    this.ddp.on('changed', (msgObj) => {
      const response = msgObj.fields.args[0];

      if (
        msgObj.collection === 'stream-room-messages' &&
        msgObj.fields.args[0].rid === this.rid &&
        this.responses.indexOf(response._id) == -1 &&
        response.u._id != this.data._id &&
        response.t != "uj" && response.t != "ul"
      ) {
        this.responses.push(response._id);

        const botState = ['promptTranscript', 'connected'];
        if (botState.indexOf(response.msg) === -1) {
          super.log(`[DEBUG ] Sending message to user. RID: ${this.rid} CHATID: ${this.chatId}`);

          Store.Chat.get(this.chatId).sendMessage(response.msg);
        } else {
          super.log(`[DEBUG ] Notifying chat termination coming from user to user. RID: ${this.rid} CHATID: ${this.chatId}`);

          this.ddp.emit('logoutGuest', this.chatId);
        }
      }
    })
  }
}
