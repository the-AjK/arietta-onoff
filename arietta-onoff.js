"use strict";

var fs = require('fs'),
  Epoll = require('epoll').Epoll;

var GPIO_ROOT_PATH = '/sys/class/gpio/',
  ZERO = new Buffer('0'),
  ONE = new Buffer('1');

//KERNEL ID - GPIO
var ariettaGPIO = {
  23: "A23",
  24: "A24",
  25: "A25",
  26: "A26",
  27: "A27",
  28: "A28",
  29: "A29",
  0: "A0",
  8: "A8",
  6: "A6",
  92: "C28",
  68: "C4",
  67: "C3",
  66: "C2",
  65: "C1",
  64: "C0",
  22: "A22",
  21: "A21",
  31: "A31",
  30: "A30",
  1: "A1",
  7: "A7",
  5: "A5",
  91: "C27",
  95: "C31",
  43: "B11",
  44: "B12",
  45: "B13",
  46: "B14",
  81: "C17"
};

exports.version = '0.1.0';

function pollerEventHandler(err, fd, events) {
  var value = this.readSync(),
    callbacks = this.listeners.slice(0);

  if (this.opts.debounceTimeout > 0) {
    setTimeout(function () {
      if (this.listeners.length > 0) {
        // Read current value before polling to prevent unauthentic interrupts.
        this.readSync();
        this.poller.modify(this.valueFd, Epoll.EPOLLPRI | Epoll.EPOLLONESHOT);
      }
    }.bind(this), this.opts.debounceTimeout);
  }

  callbacks.forEach(function (callback) {
    callback(err, value);
  });
}

/**
 * Constructor. Exports a GPIO to userspace.
 *
 * The constructor is written to function for both superusers and
 * non-superusers. See README.md for more details.
 *
 * gpio: number      // The Linux GPIO identifier; an unsigned integer.
 * direction: string // Specifies whether the GPIO should be configured as an
 *                   // input or output. The valid values are: 'in', 'out',
 *                   // 'high', and 'low'. 'high' and 'low' are variants of
 *                   // 'out' that configure the GPIO as an output with an
 *                   // initial level of high or low respectively.
 * [edge: string]    // The interrupt generating edge for the GPIO. Can be
 *                   // specified for GPIO inputs and outputs. The edge
 *                   // specified determine what watchers watch for. The valid
 *                   // values are: 'none', 'rising', 'falling' or 'both'.
 *                   // The default value is 'none'. [optional]
 * [options: object] // Additional options. [optional]
 *
 * The options argument supports the following:
 * debounceTimeout: number  // Can be used to software debounce a button or
 *                          // switch using a timeout. Specified in
 *                          // milliseconds. The default value is 0.
 */
function Gpio(gpio, direction, edge, options) {
  var valuePath,
    directionSet = false,
    tries = 0;

  if (!(this instanceof Gpio)) {
    return new Gpio(gpio, direction, edge, options);
  }

  if (typeof edge === 'object' && !options) {
    options = edge;
    edge = undefined;
  }

  options = options || {};

  this.gpioExport = gpio;
  this.gpio = ariettaGPIO[gpio];
  this.gpioPath = GPIO_ROOT_PATH + 'pio' + this.gpio + '/';
  this.opts = {};
  this.opts.debounceTimeout = options.debounceTimeout || 0;
  this.readBuffer = new Buffer(16);
  this.listeners = [];

  valuePath = this.gpioPath + 'value';

  if (!fs.existsSync(this.gpioPath)) {
    // The pin hasn't been exported yet so export it.
    fs.writeFileSync(GPIO_ROOT_PATH + 'export', this.gpioExport);
    fs.writeFileSync(this.gpioPath + 'direction', direction);

    this.valueFd = fs.openSync(valuePath, 'r+'); 
    
    if (direction == 'out' && edge != undefined) {
      //edge is used to preset the output pin after the first export
      var writeBuffer = edge === 1 ? ONE : ZERO;
      fs.writeSync(this.valueFd, writeBuffer, 0, writeBuffer.length, 0);
    } else if (edge) {
      fs.writeFileSync(this.gpioPath + 'edge', edge);
    }

  } else {
    // The pin has already been exported
    try {
      fs.writeFileSync(this.gpioPath + 'direction', direction);
    } catch (ignore) {
    }

    this.valueFd = fs.openSync(valuePath, 'r+'); 
   
    if (direction == 'out' && edge != undefined) {
      //edge is used to preset the output pin after the first export
      var writeBuffer = edge === 1 ? ONE : ZERO;
      fs.writeSync(this.valueFd, writeBuffer, 0, writeBuffer.length, 0);
    } else if (edge) {
      try {
        fs.writeFileSync(this.gpioPath + 'edge', edge);
      } catch (ignore) {
      }
    }  

  }  

  // Read current value before polling to prevent unauthentic interrupts.
  this.readSync();

  this.poller = new Epoll(pollerEventHandler.bind(this));
}
exports.Gpio = Gpio;

/**
 * Read GPIO value asynchronously.
 *
 * [callback: (err: error, value: number) => {}] // Optional callback
 */
Gpio.prototype.read = function (callback) {
  fs.read(this.valueFd, this.readBuffer, 0, 1, 0, function (err, bytes, buf) {
    if (typeof callback === 'function') {
      if (err) {
        return callback(err);
      }

      callback(null, buf[0] === ONE[0] ? 1 : 0);
    }
  });
};

/**
 * Read GPIO value synchronously.
 *
 * Returns - number // 0 or 1
 */
Gpio.prototype.readSync = function () {
  fs.readSync(this.valueFd, this.readBuffer, 0, 1, 0);
  return this.readBuffer[0] === ONE[0] ? 1 : 0;
};

/**
 * Write GPIO value asynchronously.
 *
 * value: number                  // 0 or 1
 * [callback: (err: error) => {}] // Optional callback
 */
Gpio.prototype.write = function (value, callback) {
  var writeBuffer = value === 1 ? ONE : ZERO;
  fs.write(this.valueFd, writeBuffer, 0, writeBuffer.length, 0, callback);
};

/**
 * Write GPIO value synchronously.
 *
 * value: number // 0 or 1
 */
Gpio.prototype.writeSync = function (value) {
  var writeBuffer = value === 1 ? ONE : ZERO;
  fs.writeSync(this.valueFd, writeBuffer, 0, writeBuffer.length, 0);
};

/**
 * Watch for hardware interrupts on the GPIO. Inputs and outputs can be
 * watched. The edge argument that was passed to the constructor determines
 * which hardware interrupts are watcher for.
 *
 * Note that the value passed to the callback does not represent the value of
 * the GPIO the instant the interrupt occured, it represents the value of the
 * GPIO the instant the GPIO value file is read which may be several
 * milliseconds after the actual interrupt. By the time the GPIO value is read
 * the value may have changed. There are scenarios where this is likely to
 * occur, for example, with buttons or switches that are not hadrware
 * debounced.
 *
 * callback: (err: error, value: number) => {}
 */
Gpio.prototype.watch = function (callback) {
  var events;

  this.listeners.push(callback);

  if (this.listeners.length === 1) {
    events = Epoll.EPOLLPRI;
    if (this.opts.debounceTimeout > 0) {
      events |= Epoll.EPOLLONESHOT;
    }
    this.poller.add(this.valueFd, events);
  }
};

/**
 * Stop watching for hardware interrupts on the GPIO.
 */
Gpio.prototype.unwatch = function (callback) {
  if (this.listeners.length > 0) {
    if (typeof callback !== 'function') {
      this.listeners = [];
    } else {
      this.listeners = this.listeners.filter(function (listener) {
        return callback !== listener;
      });
    }

    if (this.listeners.length === 0) {
      this.poller.remove(this.valueFd);
    }
  }
};

/**
 * Remove all watchers for the GPIO.
 */
Gpio.prototype.unwatchAll = function () {
  this.unwatch();
};

/**
 * Get GPIO direction.
 *
 * Returns - string // 'in', or 'out'
 */
Gpio.prototype.direction = function () {
  return fs.readFileSync(this.gpioPath + 'direction').toString().trim();
};

/**
 * Set GPIO direction.
 *
 * direction: string // Specifies whether the GPIO should be configured as an
 *                   // input or output. The valid values are: 'in', 'out',
 *                   // 'high', and 'low'. 'high' and 'low' are variants of
 *                   // 'out' that configure the GPIO as an output with an
 *                   // initial level of high or low respectively.
 */
Gpio.prototype.setDirection = function (direction) {
  fs.writeFileSync(this.gpioPath + 'direction', direction);
};

/**
 * Get GPIO interrupt generating edge.
 *
 * Returns - string // 'none', 'rising', 'falling' or 'both'
 */
Gpio.prototype.edge = function () {
  return fs.readFileSync(this.gpioPath + 'edge').toString().trim();
};

/**
 * Set GPIO interrupt generating edge.
 *
 * edge: string // The interrupt generating edge for the GPIO. Can be
 *              // specified for GPIO inputs and outputs. The edge
 *              // specified determine what watchers watch for. The valid
 *              // values are: 'none', 'rising', 'falling' or 'both'.
 *              // The default value is 'none'. [optional]
 */
Gpio.prototype.setEdge = function (edge) {
  fs.writeFileSync(this.gpioPath + 'edge', edge);
};

/**
 * Get GPIO options.
 *
 * Returns - object // Must not be modified
 */
Gpio.prototype.options = function () {
  return this.opts;
};

/**
 * Reverse the effect of exporting the GPIO to userspace. The Gpio object
 * should not be used after calling this method.
 */
Gpio.prototype.unexport = function () {
  this.unwatchAll();
  fs.closeSync(this.valueFd);
  fs.writeFileSync(GPIO_ROOT_PATH + 'unexport', this.gpio);
};

