# arietta-onoff 

GPIO access and interrupt detection with **io.js** or **Node.js** on the ACME's Arietta board.

Visit [AcmeSystems official site](http://www.acmesystems.it/arietta) for more informations about this hardware.

Based on [onoff](https://www.npmjs.com/package/onoff) module.

## Installation

    $ npm install arietta-onoff

## Usage

The arietta's onboard push button is connected on GPIO #81, let's assume that there's an LED on GPIO #64: 

<img src="https://raw.githubusercontent.com/the-AjK/arietta-onoff/master/arietta.PNG">

When the button is pressed the LED should turn on, when it's released the LED
should turn off. This can be achieved with the following code:

```js
var Gpio = require('arietta-onoff').Gpio,
  led = new Gpio(64, 'out'),
  button = new Gpio(81, 'in', 'both');

button.watch(function(err, value) {
  led.writeSync(value);
});
```

Here two Gpio objects are being created. One called led for the LED on GPIO #64
which is an output, and one called button for the momentary push button on
GPIO #81 which is an input. In addition to specifying that the button is an
input, the constructors optional third argument is used to specify that 'both'
rising and falling interrupt edges should be configured for the button GPIO as
both button presses and releases should be handled.

After everything has been setup correctly, the buttons watch method is used to
specify a callback function to execute every time the button is pressed or
released. The value argument passed to the callback function represents the
state of the button which will be 1 for pressed and 0 for released. This value
is used by the callback to turn the LED on or off using its writeSync method.

When the above program is running it can be terminated with ctrl-c. However,
it doesn't free its resources. It also ignores the err argument passed to
the callback. Here's a slightly modified variant of the program that handles
ctrl-c gracefully and bails out on error. The resources used by the led and
button Gpio objects are released by calling their unexport method.

```js
var Gpio = require('arietta-onoff').Gpio,
  led = new Gpio(64, 'out'),
  button = new Gpio(81, 'in', 'both');

function exit() {
  led.unexport();
  button.unexport();
  process.exit();
}

button.watch(function (err, value) {
  if (err) {
    throw err;
  }

  led.writeSync(value);
});

process.on('SIGINT', exit);
```

## How does it work?

Internally onoff uses sysfs files located at /sys/class/gpio to access GPIOs
and the [epoll module](https://github.com/fivdi/epoll) to detect hardware
interrupts. The Linux GPIO sysfs interface for userspace is documented
[here](https://www.kernel.org/doc/Documentation/gpio/sysfs.txt).
It's a relatively simple interface which can be used to ask the Linux kernel
to export control of a GPIO to userspace. After control of a GPIO has been
exported to userspace, the GPIO can be configured as an input or output.
Thereafter, the state of an input can be read, and the state of an output can
be written. Some systems will also allow the state of a output to be read.
The GPIO sysfs interface can also be used for interrupt detection. 

## API

### Class Gpio

  * Gpio(gpio, direction[, edge]) - Constructor
  * read([callback]) - Read GPIO value asynchronously
  * readSync() - Read GPIO value synchronously
  * write(value[, callback]) - Write GPIO value asynchronously
  * writeSync(value) - Write GPIO value synchronously
  * watch(callback) - Watch for hardware interrupts on the GPIO
  * unwatch([callback]) - Stop watching for hardware interrupts on the GPIO
  * unwatchAll() - Remove all watchers for the GPIO
  * direction() - Get GPIO direction
  * setDirection(direction) - Set GPIO direction
  * edge() - Get GPIO interrupt generating edge
  * setEdge(edge) - Set GPIO interrupt generating edge
  * unexport() - Reverse the effect of exporting the GPIO to userspace

##### Gpio(gpio, direction[, edge])
Returns a new Gpio object that can be used to access a GPIO.
- gpio - An unsigned integer specifying the GPIO number.
- direction - A string specifying whether the GPIO should be configured as an
input or output. The valid values are: 'in', 'out', 'high', and 'low'. 'high'
and 'low' are variants of 'out' that configure the GPIO as an output with an
initial level of high or low respectively.
- [edge] - An optional string specifying the interrupt generating edge or
edges for the GPIO. The valid values are: 'none', 'rising', 'falling' or
'both'. The default value is 'none' indicating that the GPIO does not generate
interrupts. On Linux kernels prior to 3.13 it was possible for both inputs
and outputs to generate interrupts. The 3.13 kernel dropped support for
interrupt generating outputs, irrespective of whether the underlying hardware
supports them or not.

##### read([callback])
Read GPIO value asynchronously.
- [callback] - An optional completion callback that gets two arguments (err,
value), where err is reserved for an error object and value is the number 0
or 1 and represents the state of the GPIO.

##### readSync()
Read GPIO value synchronously. Returns the number 0 or 1 to represent the
state of the GPIO.

##### write(value[, callback])
Write GPIO value asynchronously.
- value - The number 0 or 1.
- [callback] - An optional completion callback that gets one argument (err),
where err is reserved for an error object.

##### writeSync(value)
Write GPIO value synchronously.
- value - The number 0 or 1.

##### watch(callback)
Watch for hardware interrupts on the GPIO. The edge argument that was passed
to the constructor determines which hardware interrupts to watcher for.
- callback - A callback that gets two arguments (err, value), where err is
reserved for an error object and value is the number 0 or 1 and represents the
state of the GPIO.

##### unwatch([callback])
Stop watching for hardware interrupts on the GPIO. If callback is specified,
only that particular callback is removed. Otherwise all callbacks are removed.
- [callback] - The callback to remove.

##### unwatchAll()
Remove all hardware interrupt watchers for the GPIO.

##### direction()
Returns the string 'in' or 'out' indicating whether the GPIO is an input or
output.

##### setDirection(direction)
Set GPIO direction.
- direction - A string specifying whether the GPIO should be configured as an
input or output. The valid values are 'in' and 'out'.

##### edge()
Returns the string 'none', 'falling', 'rising', or 'both' indicating the
interrupt generating edge or edges for the GPIO.

##### setEdge(edge)
Set GPIO interrupt generating edge
- edge - A string specifying the interrupt generating edge or edges for the
GPIO. The valid values are: 'none', 'rising', 'falling' or 'both'. On Linux
kernels prior to 3.13 it was possible for both inputs and outputs to generate
interrupts. The 3.13 kernel dropped support for interrupt generating outputs,
irrespective of whether the underlying hardware supports them or not.

##### unexport()
Reverse the effect of exporting the GPIO to userspace

## Synchronous API

Blink the LED on GPIO #64 for 5 seconds:

```js
var Gpio = require('arietta-onoff').Gpio, // Constructor function for Gpio objects.
  led = new Gpio(64, 'out'),      // Export GPIO #64 as an output.
  iv;

// Toggle the state of the LED on GPIO #64 every 200ms.
// Here synchronous methods are used. Asynchronous methods are also available.
iv = setInterval(function () {
  led.writeSync(led.readSync() ^ 1); // 1 = on, 0 = off :)
}, 200);

// Stop blinking the LED and turn it off after 5 seconds.
setTimeout(function () {
  clearInterval(iv); // Stop blinking
  led.writeSync(0);  // Turn LED off.
  led.unexport();    // Unexport GPIO and free resources
}, 5000);
```

## Asynchronous API

Blink the LED on GPIO #64 for 5 seconds:

```js
var Gpio = require('arietta-onoff').Gpio, // Constructor function for Gpio objects.
  led = new Gpio(64, 'out');      // Export GPIO #64 as an output.

// Toggle the state of the LED on GPIO #64 every 200ms 'count' times.
// Here asynchronous methods are used. Synchronous methods are also available.
(function blink(count) {
  if (count <= 0) {
    return led.unexport();
  }

  led.read(function (err, value) { // Asynchronous read.
    if (err) {
      throw err;
    }

    led.write(value ^ 1, function (err) { // Asynchronous write.
      if (err) {
        throw err;
      }
    });
  });

  setTimeout(function () {
    blink(count - 1);
  }, 200);
}(25));
```

## Additional Information

arietta-onoff is based on onoff module. Visit [onoff](https://www.npmjs.com/package/onoff) for more informations about the original module.
