// The button flow works as follows:
//  User clicks button
//  The click event from buildBtnArray fires
//  If button.submit is false, simply fire the click event
//  If button.submit is true, fire the click event. Check to see what it returns
//    If the click event returns false, the click event is taking control over the submit action. It's passed a single argument, the submit callback to fire (optional)
//    If the click event doesn't return false, the submit callback is called back immediately after the click handler fires
//  Either way, once the submit action occurs (if it does), it fires MantaDialog.submit passing a reference to button.success if it exists
//  MantaDialog.submit shows the wait screen, cleans up old errors, builds the data from getPostData, fires omniture events, and submits the data to the model
//  The model accepts three arguments, the data, an ok callback and an error callback
//  The ok callback is a wrapped reference to MantaDialog.ok called after hiding the wait screen, it gets passed the success handler from MantaDialog.submit
//   MantaDialog.ok checks for dialog-wide ok handler, defined as part of the config (MantaDialog._config.ok), and calls it, passing the success handler (from the button)
//  The error callback is a wrapped reference to MantaDialog.error called after hiding the wait screen
//   MantaDialog.error receives the error report and tries to populate the errors into the dialog based on data-error attributes on the inputs
//   MantaDialog.error checks for dialog-wide error handler, defined as part of the config (MantaDialog._config.error), and calls it, passing it the error report

// This allows for us to inject steps before and after every action, asynchronously, with or without using the model
// See company connections and twitter implementations to see how it might be hacked heavily to support non-standard models

var MantaDialog = function MantaDialog(node, model, config) {
	var that = this;

	//TODO @nromano remove this
	//if (console && console.log)
	//	console.log('node', node, 'model', model, 'config', config);

	this._config = {
		dialogClass: 'manta-standard-dialog',
		resizable: false, //Whether or not the modal can be resized via edges / bottom-right corner
		showRequired: false, //Whether to show the red " * = required "
		width: 600,
		modal: true, //Whether the content behind modal is blocked out
		showX: false, //Whether the the "X" is shown in modal top-right
		autoOpen: false,
		footerText: "", //Text or HTML that gets floated right of the dialog buttons
		transformations: {}, // Hash of transformations
		postTransformations: [], // Array of postTransformations
		beforeClose: function(){
			that.cleanup();
		},
		catchallError: $('<div class="errorContainer" style="display: none;"></div>')
	};

	if(!node) throw new Error('Missing node passed to dialog');
	if(!model) throw new Error('Missing model passed to dialog');

	// Define any default per-field transformations here (like bool or something)
	var defaultTransformations = {
		millidate: function(v,i,a){
			return new Date(parseInt(v, 10));
		},
		date: function(v,i,a){
			return new Date(parseInt(v, 10) * 1000);
		},
		newdate: function(v,i,a){
			return new Date();
		},
		bool: function(v,i,a){
			v = new String(v).toLowerCase();
			if(v == "true" || v == "1"){
				return true;
			}else{
				return false;
			}
		},
		httpify: function(v,i,a){
			if(typeof v != 'undefined' && v != '' && !v.match(/^https?:\/\//)){
				v = 'http://' + v;
			}
			return v;
		}
	};

	// Define any default post transformations here (like serializeDates or something)
	var defaultPostTransformations = [
		// Example
		function(data){
			// Modify data here
//			data['extra_field'] = 'this should be removed';
		}
	];

	var transformations = $.extend(defaultTransformations, config.transformations);
	config.transformations = transformations;

	if(typeof config.postTransformations == 'function') config.postTransformations = [ config.postTransformations ]; // Fudge a single transformation into an array
	var postTransformations = [].concat(defaultPostTransformations).concat(config.postTransformations); // Merge both config-defined and default transformations
	config.postTransformations = postTransformations;

	this.formWidgets = [];
	if(config.formWidgets){
		this.formWidgets = config.formWidgets;
		delete config.formWidgets;
	}

	this._config = $.extend(this._config, config);
	this._node = node;
	this._standarizedBtns = {};
	this._parent = undefined;
	this._model = model;
	this.showWait = false;
	this.buttons = {};
	this.init();
};

MantaDialog.prototype.attach = function(widget){
	this.formWidgets.push(widget);
};

MantaDialog.prototype.init = function() {
	this._config.title = this.wrapTitle(); // Wrap title with required message
	this._config.buttons = this.buttons = this.buildBtnArray(); // Build the old-style button array and wrap the callbacks with submit handlers where appropriate

	this.dialog = $(this._node).dialog(this._config); // Call jQuery Dialog
	this._parent = $(this.dialog).parents("."+this._config.dialogClass);

	$(this.dialog).prepend(this._config.catchallError);

	this.applyBtnClass(); //Apply Button Classes
	this.applyFooterText();
	$(this.dialog).wrap("<div class='dialog-wrapper'></div>"); //Wrap Dialog contents in a wrapper for styling
	if(!this._config.showX) { $(this._parent).addClass("hideX"); } //Hide the closing X if required.
};

MantaDialog.prototype.setupMaxLenFields = function () {
	var that = this,
		inputs = $("[data-maxlength]", this._parent); // Query for the inputs

	$.each(inputs, function (i, x) {
		var test = new MaxLengthField("test", {
			inputSelector:"#" + $(x).attr("id")
		});
	});
};

MantaDialog.prototype.cleanup = function () {
	$(".error:not(label)", this._parent).removeClass("error"); //Remove error class on inputs
	$("label.error", this._parent).hide(); //Hide error label messages
	$(".errorContainer", this._parent).html("").hide();
};

MantaDialog.prototype.applyFooterText = function () {
	var btnContainer = $(".ui-dialog-buttonpane", this._parent);

	$(btnContainer).prepend("<div class='footerText'>" + this._config.footerText + "</div>");
};

/**
 * Wraps the config.title text in a div as well as shows/hides the "* = required"
 */
MantaDialog.prototype.wrapTitle = function () {
	var requiredMsg = '<span class="req_red_right" unselectable="on">* = required field</span>',
		title = $(this._node).attr("title"),
		wrapped = "";

	if (this._config.showRequired) {
		title = title + requiredMsg;
	}

	wrapped = "<div class='uline'>" + title + "</div>";

	return wrapped;
};

MantaDialog.prototype.omnitureEvt = function () {
	if(typeof this._config.omniture !== "undefined"){ //If Oniture object is defined
		if(typeof window.omniture_click === "function"){ // Make sure the omniture code is available
			var eVar = this._config.omniture.evar,
				sprop = this._config.omniture.sprop,
				event = this._config.omniture.event,
				omnitureObj = {},
				eventName = this._config.omnitureID;

			var omnitureOverride = this.dialog.data("omnitureoverride") || false;
			if(omnitureOverride){
				eventName = omnitureOverride;
			}

			omnitureObj[eVar] = eventName;
			omnitureObj[sprop] = eventName;

			omniture_click(eventName, "o", omnitureObj, [event]);
		}
	}
}

/**
 * Puts buttons in array and strips out custom class. Only required b/c we're using an outdated jquery-ui.js
 */
MantaDialog.prototype.buildBtnArray = function () {
	var tempButtons = {},
		btnClasses = [],
		that = this;

	// Iterate the button declarations and build a fancy click wrapper that maps directly to jQuery UI configuration
	$.each(this._config.buttons, function (i, x) {
		if (x.submit) { // If they want the button to submit the form

			// Set up the click handler, passing the MantaDialog as context
			tempButtons[x.text] = (function (click, success) { // Outer closure to resolve x.click and x.success to click and success immediately
				// Default to no success and no click callbacks
				if(typeof success != 'function') success = function(){};
				if(typeof click != 'function') click = function(){ return true; };

				return function () { // The actual click event handler
					// The submit action, passing reference to success (x.success) if they have one, to be called on successful response
					var submit = function(){ that.submit(success); };
					// Call the user-defined click method (if it exists) and pass it a reference to the submit handler
					// If it returns false, that indicates that it will be calling the submit handler itself (it doesn't indicate anything about the result)
					// If not, we assume it wasn't an asynchronous operation, let it fire, then call the submit handler

					// If the click handler returns false, they either wanted to cancel the submit or they handled it themselves

					if(click.call(that, submit) !== false){
						submit();
					}
				};
			})(x.click, x.success);

		} else {
			tempButtons[x.text] = function(){ return x.click.call(that, function(){}); }; // No submit handler, just use the click handler directly
		}
		btnClasses.push(x.btnClass || "");
	});

	this._btnClasses = btnClasses;
	return tempButtons;
};

/**
 * Adds custom class to button if passed in buttons object
 */
MantaDialog.prototype.applyBtnClass = function () {
	var that = this;
	$.each(this._btnClasses, function (i, x) {
		var node = $(".ui-dialog-buttonpane button", that._parent)[i];
		$(node).addClass(x);
	});
};

/**
 * Pass true to show it or false to hide it, otherwise toggle the existing state
 */
MantaDialog.prototype.toggleWait = function(showWait){
	var dest = (showWait === true || showWait === false) ? showWait : !this.showWait;
	if(dest){
		var shade = $('.wait-shade', this.dialog);
		if(!shade.length){
			$(this.dialog).append(
				$('<div class="wait-shade"></div>')
					.css( {
						background: 'black',
						width:      '100%',
						height:     '100%',
						position:   'absolute',
						top:        0,
						left:       0,
						zIndex:     99,
						opacity:    0.7,
						color:      '#FFFFFF',
						fontSize:   '22px',
						textAlign:  'center',
						paddingTop: '100px'
					} )
					.html('Saving...')
			);
		}else{
			shade.show();
		}
		this.showWait = true;
	}else{
		$('.wait-shade', this.dialog).hide();
		this.showWait = false;
	}
};

// okCB stores a callback to any dialog-specific code to be fired after this.ok is called
// It's not called if this.error is called
MantaDialog.prototype.submit = function(okCB, data){
	var that = this;

	if(arguments.length == 3 && typeof arguments[1] == 'function' && typeof arguments[2] == 'function'){
		// They are manually specifying ok/error response handlers
		ok = arguments[1];
		error = arguments[2];
	}else{
		ok = function(data){ that.ok(data, okCB); };
		error = function(err){ that.error(err); };
	}

	this.toggleWait(true);

	// Hide errors
	this.cleanup();

	// Omniture Events
	this.omnitureEvt();

	if (typeof data === 'object') {
		var postData = data;
	} else {
		var postData = this.getPostData();
	}

	this._model.save(
		postData, // The fields to change
		function(err){
			that.toggleWait(false);
			ok(err);
		}, // OK response handler
		function(err){
			that.toggleWait(false);
			error(err);
		} // Error response handler
	);
};

// Submit method for invoking from the console (prints console messages about the response for debugging visual feedback issues
// This will actually save, it just won't call this.ok or this.error on response
MantaDialog.prototype.consoleSubmit = function(okCB){
	this.submit(
		okCB,
		function(data){
			console.log('OK response');
			console.dir(data);
		},
		function(err){
			console.log('Error response');
			console.dir(err);
		}
	);
};

// Build the post data hash from the dialog by selecting $(':input', dialog).not(':disabled')
// Run any transformations to help munge the data into a hash, and return the hash
MantaDialog.prototype.getPostData = function () {
	var that = this;
	var postData = {};

	// First go over the widgets attached to this dialog and clear out blank items where possible
	// For each, check all the items in the widget. If there are any filled out, delete all the blank items in the widget. If there are none filled out, do nothing
	// Note that we don't take "default state" into account here -- if there's a checked radio button or checkbox, or a hidden input, or a text field with default text, it will count as being filled out
	// Also note that deleting any items less than minItems causes another blank item to be added to the end of the list
	$.each(this.formWidgets, function(x,widget){
		var items = widget.getItems();
		var widgetIsEmpty = true;
		var toDelete = new window.lib.chain.chain();
		$.each(items, function(i, item){
			var itemEmpty = true;
			// Find all inputs in this widget
			var inputs = $(':input', item).each(function(j,input){
				if($(input).val() != ''){
					itemEmpty = false;
					return false;
				}
			});
			if(itemEmpty){
				// None of the inputs have been filled out, don't include this widget
				toDelete.add((function(widget){
					return function(next){
						var id = $(item).attr(widget._config.itemIdField);
						widget.deleteItem(id);
						next();
					};
				})(widget));
			}else{
				widgetIsEmpty = false;
			}
		});
		if(!widgetIsEmpty){
			// They filled out at least one item in the widget, so delete all the blank ones
			toDelete.run();
		}
	});

	// Fetch the form fields to work with (enabled ones only)
	var formFields = $(':input', this.dialog).not(':disabled');

	// Clean up the values with any special scrubbing routines here (modify the fields inline)
	formFields.each(function(x,f){
		var field = $(f);
		field.val(field.val().replace(/^\s+/, '').replace(/\s+$/, '')); // Trim spaces off the beginning and end in the field itself
	});

	// Fetch everything from the form fields into a nice object
	var formData = formFields.serializeArray();

	// For each form field, build out the required path to populate the value. This behaves kind of like mkdir -p
	$.each(formData, function (x, field) {
		// Find the node the field is referring to
		var node = $(':input[name=' + String.addquotes.call(field.name, '"') + ']', that.dialog);
		var value = field.value;

		// Apply any inline transformations to help convert form data into JSON data
		if(node.attr('data-transformer')){
			// The transformers are space-separated and run in order
			var transformers = node.attr('data-transformer').split(' ');
			for(var k = 0; k < transformers.length; k++){
				var transformerName = transformers[k];
				var transformer = that._config.transformations[transformerName];
				if(transformer && typeof transformer == 'function'){
					value = transformer(value, field.name, formData);
				}
			}
		}

		//window.console.log(postData, field.name, value);

		// Store the value into the JSON object with the full path built out
		Object.dotPathValue.call(postData, field.name, value);
	});

	var isEmptySubdoc = function(o){
		var empty = true;
		for(var i in o){
			if(o[i] != ""){
				empty = false;
				break;
			}
		}
		return empty;
	};

	// This is basically a hack to accomodate for blank/non-blank arrays of items (subdocument or not)
	Object.walk.call(postData, function(a){
		// Find only arrays
		if(a instanceof Array){
			// Iterate all the elements of a and if they're all empty strings (or subdocuments full of empty strings), set a to an empty array
			var empty = true;
			for(var i = 0; i < a.length; i++){
				var v = a[i];
				if(Object.isPlainObject(v)){ // Array of subdocuments
					if(!isEmptySubdoc(v)){
						empty = false;
						break;
					}
				}else if(v != ""){ // Array of strings
					empty = false;
					break;
				}
			}
			if(empty) a = [];

			// Finally, go backward through the elements and remove any blank ones off the end (they're just fillers)
			for(var i = a.length - 1; i >= 0; i--){
				// If we find a subdoc with something in it, stop

				var isEmpty = (Object.isPlainObject(a[i]) ) ? isEmptySubdoc(a[i]) : a[i] == "";
				if(!isEmpty) break;
				// Otherwise, we're still iterating from the end, and still getting blank ones, so ignore them
				a.pop();
			}
		}
		// Ignore non-arrays here
		return a;
	}, false); // Walk over all iterable objects, false means we don't want to automatically walk arrays

	// If they have any dialog-wide postTransformation stages, execute each of them on the postData object
	if(that._config.postTransformations.length > 0){
		var transformations = that._config.postTransformations;
		for(var i = 0; i < transformations.length; i++){
			var transformer = transformations[i];
			if(typeof transformer == 'function'){
				transformer(postData);
			}
		}
	}

	return postData;
};

MantaDialog.prototype.ok = function (response, callback) {
	var that = this;
	var callback = (typeof callback === "function") ? callback : function () {};

	// We got an ok response, see if the dialog has an ok step
	if (typeof this._config.ok === "function") {
		this._config.ok(response, function () {
			callback.call(that, response);
		});
	} else {
		callback.call(that, response);
	}
};

MantaDialog.prototype.error = function(error){
	var that = this;

	// Remove previous errors
	$(":input", that.dialog).each(function(){
		var dataErrorNode = $(this).attr('data-error');
		if( typeof dataErrorNode !== "undefined"){
			$( '#' + String.escapejQuerySelector.call(dataErrorNode) ).html('');
		}
	});

	if(error.errors){
		// Field-based errors
		$.each(error.errors, function(i,e){
			// For each, find the correct container and add the error if it doesn't already exist
			var errType = e.type,
				node = $(":input[name='" + e.path + "']", that._parent),
				errorMsg = that.getErrorMessage(errType, e.path);
			var errMsgNodeId = $(node).attr('data-error');

			if(!node){
				console.log('[MantaDialog] Received an error for field "' + e.path + '", but couldnt find a field for it');
				console.dir(e);
				return;
			}

			if(errMsgNodeId){
				var errMsgNode = $( '#' + String.escapejQuerySelector.call(errMsgNodeId) )
				var old = errMsgNode.html();
				if(!old.match(errorMsg)){
					// Append the error message if it hasn't already been included in this container
					errMsgNode.html(errMsgNode.html() + (old.length > 0 ? "<br />" : "") + errorMsg);
				}
				errMsgNode.show();
			}else{
				console.log('[MantaDialog] Received an error for field "' + e.path + '" but the field doesnt have an error container (data-error) attached to it');
			}

			node.addClass("error");
		});
	}else{
		// Catch-all error case, maybe some further handling here
		var msg = error.message ? error.message : JSON.stringify(error);
		$(".errorContainer", that._parent).html(msg).show();
	}

	if(typeof this._config.error === "function"){
		this._config.error(error);
	}
};

MantaDialog.prototype.getErrorMessage = function(type, path){
	var defaults = {
		MatchFailed: 'This field has an unacceptable format',
		RequiredField: 'This field cannot be blank',
		MaxCountExceeded: 'Too many items in this collection',
		MinCountNotMet: 'Too few items in this collection',
		ValueLengthExceeded: 'Too many characters in this field',
		ValueLengthBelowExpectation: 'Too few characters in this field',
		IncompleteField: 'This field cannot be blank',
		// Structural issues
		MissingExpression: 'Something is wrong with the request',
		TesterFailed: 'Something is wrong with this field',
		InvalidValue: 'Something is wrong with this field',
		InvalidField: 'Something is wrong with the request',
		InvalidSubdocument: 'Something is wrong with the request',
		InvalidInstance: 'Something is wrong with the request',
		InvalidConstructor: 'Something is wrong with the request',

		Default: 'Something is wrong with this field'
	};

	// Try to find a custom error message
	path = path.replace(/(\.[0-9]+)/g, ''); // Remove array position references
	path = path + '.' + type;
	var parts = path.split(/\./);
	var ref = this._config.errors;
	if(this._config.errors[path]){
		// Shorthand dot-notation lookup
		ref = this._config.errors[path];
	}else{
		if(Object.isPlainObject(ref)){
			for(var i = 0; i < parts.length; i++){
				if(Object.isPlainObject(ref[parts[i]]) || i + 1 == parts.length){
					ref = ref[parts[i]];
				}else{
					ref = false;
					break;
				}
			}
		}else{
			ref = false;
		}
	}

	var error = defaults.Default;
	if(!ref){
		if(defaults[type]){
			error = defaults[type];
		}else{
			error = defaults.Default;
		}
	}else{
		error = ref;
	}

	return error;
};