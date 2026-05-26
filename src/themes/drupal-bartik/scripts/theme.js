/**
 * Drupal-Bartik theme — main theme script. Registers behaviors on
 * `Drupal.behaviors`, the canonical pattern for progressively-enhanced
 * Drupal sites. Each interactive widget gets its own behavior block
 * (`menuMain` below; future blocks for `back-to-top`, `cookie-banner`,
 * etc. attach the same way).
 *
 * The tiny `once()` polyfill at the top mirrors Drupal core's
 * `core/once` library — used by every modern Drupal behavior to avoid
 * double-binding when AJAX or BigPipe inserts new DOM.
 *
 * Source pattern: Drupal 10 Olivero theme's primary-nav menu toggle,
 * which keeps the parent <a> as the real click target and ships the
 * chevron <button> as a non-focusable visual hint (aria-hidden +
 * tabindex=-1) — both attributes are stripped on JS attach so the
 * button becomes a real fallback control.
 */

( ( Drupal ) => {
  'use strict';

  // `once()` polyfill — mirrors `@drupal/once` (core/once). Every
  // processed element carries a single `data-once` attribute that
  // holds a space-separated list of IDs; subsequent calls with the
  // same id skip elements already in that list.
  const once = ( id, selector, context ) => {
    context = context || document;
    const out = [];
    const matches = context.querySelectorAll ? context.querySelectorAll( selector ) : [];
    matches.forEach( ( el ) => {
      const current = el.getAttribute( 'data-once' ) || '';
      const ids = current ? current.split( /\s+/ ) : [];
      if ( ids.indexOf( id ) !== -1 ) return;
      ids.push( id );
      el.setAttribute( 'data-once', ids.join( ' ' ) );
      out.push( el );
    } );
    return out;
  };

  Drupal.behaviors = Drupal.behaviors || {};

  // Sync aria-expanded across the <a> link and its sibling chevron
  // <button>, then close every other open submenu in the same block.
  const setItemOpen = ( li, open ) => {
    const link = li.querySelector( ':scope > .menu-item__link--has-children' );
    const toggle = li.querySelector( ':scope > .menu-item__toggle' );
    const value = open ? 'true' : 'false';
    if ( link ) link.setAttribute( 'aria-expanded', value );
    if ( toggle ) toggle.setAttribute( 'aria-expanded', value );
  };

  const closeAllInBlock = ( block ) => {
    block
      .querySelectorAll( '.menu-item--expanded' )
      .forEach( ( li ) => setItemOpen( li, false ) );
  };

  Drupal.behaviors.menuMain = {
    attach: function ( context ) {
      // Remove the aria-hidden + tabindex on toggle buttons so they
      // become focusable fallback controls now that JS is running.
      once(
        'menu-main-toggle-activate',
        '.block--system-menu-block-main .menu-item__toggle',
        context
      ).forEach( ( toggle ) => {
        toggle.removeAttribute( 'aria-hidden' );
        toggle.removeAttribute( 'tabindex' );
      } );

      // Both the <a> and the sibling <button> open the submenu —
      // clicking either is intercepted and toggles aria-expanded.
      const triggerSelector =
        '.block--system-menu-block-main .menu-item__link--has-children, ' +
        '.block--system-menu-block-main .menu-item__toggle';

      once( 'menu-main-trigger', triggerSelector, context ).forEach( ( trigger ) => {
        trigger.addEventListener( 'click', ( event ) => {
          event.preventDefault();
          event.stopPropagation();
          const li = trigger.closest( '.menu-item--expanded' );
          if ( ! li ) return;
          const block = li.closest( '.block--system-menu-block-main' );
          const wasOpen = trigger.getAttribute( 'aria-expanded' ) === 'true';
          if ( block ) closeAllInBlock( block );
          setItemOpen( li, ! wasOpen );
        } );
      } );

      // Outside-click and Escape handlers bind once to the document.
      if ( ! document.documentElement.dataset.drupalMenuMainBound ) {
        document.documentElement.dataset.drupalMenuMainBound = '1';

        document.addEventListener( 'click', ( event ) => {
          if (
            event.target.closest( '.block--system-menu-block-main .menu-item--expanded' )
          ) {
            return;
          }
          document
            .querySelectorAll( '.block--system-menu-block-main' )
            .forEach( closeAllInBlock );
        } );

        document.addEventListener( 'keydown', ( event ) => {
          if ( event.key !== 'Escape' ) return;
          document
            .querySelectorAll( '.block--system-menu-block-main' )
            .forEach( closeAllInBlock );
        } );
      }
    },
  };

  if ( document.readyState === 'loading' ) {
    document.addEventListener( 'DOMContentLoaded', () =>
      Drupal.behaviors.menuMain.attach( document )
    );
  } else {
    Drupal.behaviors.menuMain.attach( document );
  }
} )( ( window.Drupal = window.Drupal || {} ) );
