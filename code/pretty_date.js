/*
 * JavaScript Pretty Date
 * Copyright (c) 2011 John Resig (ejohn.org)
 * Licensed under the MIT and GPL licenses.
 */

// Takes an ISO time and returns a string representing how
// long ago the date represents.
var time_formats = [
	[60, 'just now', 'just now'], // 60
	[120, '1 minute ago', '1 minute from now'], // 60*2
	[3600, 'minutes', 60], // 60*60, 60
	[7200, '1 hour ago', '1 hour from now'], // 60*60*2
	[86400, 'hours', 3600], // 60*60*24, 60*60
	[172800, 'yesterday', 'tomorrow'], // 60*60*24*2
	[604800, 'days', 86400], // 60*60*24*7, 60*60*24
	[1209600, 'last week', 'next week'], // 60*60*24*7*4*2
	[2419200, 'weeks', 604800], // 60*60*24*7*4, 60*60*24*7
	[4838400, 'last month', 'next month'], // 60*60*24*7*4*2
	[29030400, 'months', 2419200], // 60*60*24*7*4*12, 60*60*24*7*4
	[58060800, 'last year', 'next year'], // 60*60*24*7*4*12*2
	[2903040000, 'years', 29030400], // 60*60*24*7*4*12*100, 60*60*24*7*4*12
	[5806080000, 'last century', 'next century'], // 60*60*24*7*4*12*100*2
	[58060800000, 'centuries', 2903040000] // 60*60*24*7*4*12*100*20, 60*60*24*7*4*12*100
];
var prettyDate = function (time){
	var seconds = (((new Date()).getTime() - time) / 1000);
	var token = 'ago',
		list_choice = 1;
	if (seconds < 0) {
		seconds = Math.abs(seconds);
		token = 'from now';
		list_choice = 2;
	}
	var i = 0,
		format;
	while (format = time_formats[i]) {
		if (seconds < format[0]) {
			if (typeof format[2] == 'string') {
				return format[list_choice];
			} else {
				return Math.floor(seconds / format[2]) + ' ' + format[1] + ' ' + token;
			}
		}
		i++;
	}
	return time;
};

// If jQuery is included in the page, adds a jQuery plugin to handle it as well
if ( typeof jQuery != "undefined" ) {
	$.fn.prettyDate = function(){
		return this.each(function(){
			var date = prettyDate(this.id);
			if ( date )
				$(this).text( date );
		});
	};
}