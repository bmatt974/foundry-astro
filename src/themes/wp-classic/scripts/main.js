/**
 * WP-Classic theme — main interactivity script. Mimics the directive-
 * driven pattern of `@wordpress/interactivity` (WP 6.5+) for the
 * block-navigation primitive, with room for additional block view
 * scripts (search modal, image carousel, etc.) registered via the
 * same `wp.interactivity.store()` entry point further below.
 *
 * Pattern source: WordPress core's `wp-content/blocks/navigation/view.js`,
 * which the block editor inlines on every page that ships a
 * block-navigation primitive.
 */
( function () {
	'use strict';

	if ( ! window.wp ) {
		window.wp = {};
	}
	if ( ! window.wp.interactivity ) {
		window.wp.interactivity = { store: function () {} };
	}

	var actions = {
		toggleMenuOnClick: function ( event, element ) {
			event.preventDefault();
			event.stopPropagation();
			var siblings = document.querySelectorAll(
				'[data-wp-on--click="actions.toggleMenuOnClick"]'
			);
			Array.prototype.forEach.call( siblings, function ( sibling ) {
				if ( sibling !== element ) {
					sibling.setAttribute( 'aria-expanded', 'false' );
				}
			} );
			var current = element.getAttribute( 'aria-expanded' ) === 'true';
			element.setAttribute( 'aria-expanded', current ? 'false' : 'true' );
		},
	};

	// Lookalike of the Interactivity API `store()` registration —
	// keeps the WP DevTools footprint visible in window.wp.
	window.wp.interactivity.store( 'core/navigation', { actions: actions } );

	function bind() {
		var triggers = document.querySelectorAll(
			'[data-wp-on--click="actions.toggleMenuOnClick"]'
		);
		Array.prototype.forEach.call( triggers, function ( trigger ) {
			trigger.addEventListener( 'click', function ( event ) {
				actions.toggleMenuOnClick( event, trigger );
			} );
		} );

		document.addEventListener( 'click', function ( event ) {
			if ( event.target.closest( '.wp-block-navigation .has-child' ) ) {
				return;
			}
			Array.prototype.forEach.call( triggers, function ( trigger ) {
				trigger.setAttribute( 'aria-expanded', 'false' );
			} );
		} );

		document.addEventListener( 'keydown', function ( event ) {
			if ( event.key !== 'Escape' ) {
				return;
			}
			Array.prototype.forEach.call( triggers, function ( trigger ) {
				trigger.setAttribute( 'aria-expanded', 'false' );
			} );
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', bind );
	} else {
		bind();
	}
} )();
