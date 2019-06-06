'use strict';

import React from 'react';
import {
  StyleSheet,
  Dimensions,
  Animated,
  Text,
  TouchableWithoutFeedback,
  View,
  LayoutAnimation,
  Platform,
  Easing
} from 'react-native';
import createReactClass from 'create-react-class';
import PropTypes from 'prop-types';

var noop = () => {};

var {height: SCREEN_HEIGHT, width: SCREEN_WIDTH} = Dimensions.get('window');
var DEFAULT_ARROW_SIZE = new Size(10, 5);

function Point(x, y) {
  this.x = x;
  this.y = y;
}

function Size(width, height) {
  this.width = width;
  this.height = height;
}

function Rect(x, y, width, height) {
  this.x = x;
  this.y = y;
  this.width = width;
  this.height = height;
}

function isDifferentRect(rect1, rect2) {
  return (
    rect1.x != rect2.x ||
    rect1.y != rect2.y ||
    rect1.width != rect2.width ||
    rect1.height != rect2.height
  );
}

var Popover = createReactClass({
  propTypes: {
    isVisible: PropTypes.bool,
    shouldRetain: PropTypes.bool,
    onClose: PropTypes.func,
  },
  getInitialState() {
    return {
      contentSize: {},
      anchorPoint: { x: 0, y: 0},
      popoverOrigin: { x: 0, y: 0},
      placement: 'auto',
      isTransitioning: false,
      defaultAnimatedValues: {
        scale: new Animated.Value(0),
        translate: new Animated.ValueXY(),
        fade: new Animated.Value(0),
      },
    };
  },
  getDefaultProps() {
    return {
      isVisible: false,
      shouldRetain: false,
      displayArea: new Rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT),
      arrowSize: DEFAULT_ARROW_SIZE,
      placement: 'auto',
      onClose: noop,
    };
  },
  measureContent(x) {
    var {width, height} = x.nativeEvent.layout;
    var contentSize = {width, height};
    var geom = this.computeGeometry({contentSize});

    var isAwaitingShow = this.state.isAwaitingShow;
    this.setState(Object.assign(geom,
      {contentSize, isAwaitingShow: false}), () => {
      // Once state is set, call the showHandler so it can access all the geometry
      // from the state
      isAwaitingShow && this._startAnimation({show: true});
    });
  },
  computeGeometry({contentSize, placement}) {
    placement = placement || this.props.placement;

    var options = {
      displayArea: this.props.displayArea,
      fromRect: this.props.fromRect,
      arrowSize: this.getArrowSize(placement),
      contentSize,
    }

    switch (placement) {
      case 'top':
        return this.computeTopGeometry(options);
      case 'bottom':
        return this.computeBottomGeometry(options);
      case 'left':
        return this.computeLeftGeometry(options);
      case 'right':
        return this.computeRightGeometry(options);
      default:
        return this.computeAutoGeometry(options);
    }
  },
  computeTopGeometry({displayArea, fromRect, contentSize, arrowSize}) {
    var popoverOrigin = new Point(
      Math.min(displayArea.x + displayArea.width - contentSize.width,
        Math.max(displayArea.x, fromRect.x + (fromRect.width - contentSize.width) / 2)),
      fromRect.y - contentSize.height - arrowSize.height);
    var anchorPoint = new Point(fromRect.x + fromRect.width / 2.0, fromRect.y);

    return {
      popoverOrigin,
      anchorPoint,
      placement: 'top',
    }
  },
  computeBottomGeometry({displayArea, fromRect, contentSize, arrowSize}) {
    var popoverOrigin = new Point(
      Math.min(displayArea.x + displayArea.width - contentSize.width,
        Math.max(displayArea.x, fromRect.x + (fromRect.width - contentSize.width) / 2)),
      fromRect.y + fromRect.height + arrowSize.height);
    var anchorPoint = new Point(fromRect.x + fromRect.width / 2.0, fromRect.y + fromRect.height);

    return {
      popoverOrigin,
      anchorPoint,
      placement: 'bottom',
    }
  },
  computeLeftGeometry({displayArea, fromRect, contentSize, arrowSize}) {
    var popoverOrigin = new Point(fromRect.x - contentSize.width - arrowSize.width,
      Math.min(displayArea.y + displayArea.height - contentSize.height,
        Math.max(displayArea.y, fromRect.y + (fromRect.height - contentSize.height) / 2)));
    var anchorPoint = new Point(fromRect.x, fromRect.y + fromRect.height / 2.0);

    return {
      popoverOrigin,
      anchorPoint,
      placement: 'left',
    }
  },
  computeRightGeometry({displayArea, fromRect, contentSize, arrowSize}) {
    var popoverOrigin = new Point(fromRect.x + fromRect.width + arrowSize.width,
      Math.min(displayArea.y + displayArea.height - contentSize.height,
        Math.max(displayArea.y, fromRect.y + (fromRect.height - contentSize.height) / 2)));
    var anchorPoint = new Point(fromRect.x + fromRect.width, fromRect.y + fromRect.height / 2.0);

    return {
      popoverOrigin,
      anchorPoint,
      placement: 'right',
    }
  },
  computeAutoGeometry({displayArea, contentSize}) {
    var placementsToTry = ['left', 'right', 'bottom', 'top'];

    for (var i = 0; i < placementsToTry.length; i++) {
      var placement = placementsToTry[i];
      var geom = this.computeGeometry({contentSize: contentSize, placement: placement});
      var {popoverOrigin} = geom;

      if (popoverOrigin.x >= displayArea.x
          && popoverOrigin.x <= displayArea.x + displayArea.width - contentSize.width
          && popoverOrigin.y >= displayArea.y
          && popoverOrigin.y <= displayArea.y + displayArea.height - contentSize.height) {
        break;
      }
    }

    return geom;
  },
  getArrowSize(placement) {
    var size = this.props.arrowSize;
    switch(placement) {
      case 'left':
      case 'right':
        return new Size(size.height, size.width);
      default:
        return size;
    }
  },
  getArrowColorStyle(color) {
    return { borderTopColor: color };
  },
  getArrowRotation(placement) {
    switch (placement) {
      case 'bottom':
        return '180deg';
      case 'left':
        return '-90deg';
      case 'right':
        return '90deg';
      default:
        return '0deg';
    }
  },
  getArrowDynamicStyle() {
    var {anchorPoint, popoverOrigin} = this.state;
    var arrowSize = this.props.arrowSize;

    // Create the arrow from a rectangle with the appropriate borderXWidth set
    // A rotation is then applied dependending on the placement
    // Also make it slightly bigger
    // to fix a visual artifact when the popover is animated with a scale
    var width = arrowSize.width + 2;
    var height = arrowSize.height * 2 + 2;

    return {
      left: anchorPoint.x - popoverOrigin.x - width / 2,
      top: anchorPoint.y - popoverOrigin.y - height / 2,
      width: width,
      height: height,
      borderTopWidth: height / 2,
      borderRightWidth: width / 2,
      borderBottomWidth: height / 2,
      borderLeftWidth: width / 2,
    }
  },
  getTranslateOrigin() {
    var {contentSize, popoverOrigin, anchorPoint} = this.state;
    var popoverCenter = new Point(popoverOrigin.x + contentSize.width / 2,
      popoverOrigin.y + contentSize.height / 2);
    return new Point(anchorPoint.x - popoverCenter.x, anchorPoint.y - popoverCenter.y);
  },
  componentWillReceiveProps(nextProps:any) {
    var willBeVisible = nextProps.isVisible;
    var {
      isVisible,
    } = this.props;

    if (willBeVisible != isVisible) {
      if (willBeVisible) {
        // We want to start the show animation only when contentSize is known
        // so that we can have some logic depending on the geometry
        this.setState({contentSize: {}, isAwaitingShow: true});
      } else {
        this._startAnimation({show: false});
      }
    }
  },
  componentDidUpdate(prevProps, prevState) {
    var {
      isVisible,
    } = this.props;

    if (isVisible && prevProps.isVisible &&
      (isDifferentRect(prevProps.fromRect, this.props.fromRect) || isDifferentRect(prevProps.displayArea, this.props.displayArea))) {
      var geom = this.computeGeometry({contentSize: this.props.displayArea});

      const CustomLayoutLinear = {
        duration: 150,
        update: {
          type: LayoutAnimation.Types.linear,
        }
      };
      LayoutAnimation.configureNext(CustomLayoutLinear);

      this.setState({...geom});
    }
  },
  _startAnimation({show}) {
    var handler = this.props.startCustomAnimation || this._startDefaultAnimation;
    handler({show, doneCallback: () => this.setState({isTransitioning: false})});
    this.setState({isTransitioning: true});
  },
  _startDefaultAnimation({show, doneCallback}) {
    var animDuration = 300;
    var values = this.state.defaultAnimatedValues;
    var translateOrigin = this.getTranslateOrigin();

    if (show) {
      values.translate.setValue(translateOrigin);
    }

    var commonConfig = {
      duration: animDuration,
      easing: show ? Easing.out(Easing.back()) : Easing.inOut(Easing.quad),
      useNativeDriver: Platform.OS === 'ios', // this config has bug on Android
    }

    Animated.parallel([
      Animated.timing(values.scale, {
        toValue: show ? 1 : 0,
        ...commonConfig,
      }),
      Animated.timing(values.fade, {
        toValue: show ? 1 : 0,
        ...commonConfig,
      }),
      Animated.timing(values.translate, {
        toValue: show ? new Point(0, 0) : translateOrigin,
        ...commonConfig,
      })
    ]).start(doneCallback);
  },
  _getDefaultAnimatedStyles() {
    // If there's a custom animation handler,
    // we don't return the default animated styles
    if (typeof this.props.startCustomAnimation !== 'undefined') {
      return null;
    }

    var animatedValues = this.state.defaultAnimatedValues;

    return {
      backgroundStyle: {
        opacity: animatedValues.fade,
      },
      arrowStyle: {
        transform: [
          {
            scale: animatedValues.scale.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            }),
          }
        ],
      },
      contentStyle: {
        transform: [
          {translateX: animatedValues.translate.x},
          {translateY: animatedValues.translate.y},
          {scale: animatedValues.scale},
        ],
      }
    };
  },
  _getExtendedStyles() {
    var background = [];
    var popover = [];
    var arrow = [];
    var content = [];

    [this._getDefaultAnimatedStyles(), this.props].forEach((source) => {
      if (source) {
        background.push(source.backgroundStyle);
        popover.push(source.popoverStyle);
        arrow.push(source.arrowStyle);
        content.push(source.contentStyle);
      }
    });

    return {
      background,
      popover,
      arrow,
      content,
    }
  },
  render() {
    if (!this.props.isVisible && !this.state.isTransitioning && !this.props.shouldRetain) {
        return null;
    }

    var {popoverOrigin, placement} = this.state;
    var extendedStyles = this._getExtendedStyles();
    var contentStyle = [styles.content, ...extendedStyles.content];
    var arrowColor = StyleSheet.flatten(contentStyle).backgroundColor;
    var arrowColorStyle = this.getArrowColorStyle(arrowColor);
    var arrowDynamicStyle = this.getArrowDynamicStyle();
    var contentSizeAvailable = this.state.contentSize.width;

    // Special case, force the arrow rotation even if it was overriden
    var arrowStyle = [styles.arrow, arrowDynamicStyle, arrowColorStyle, ...extendedStyles.arrow];
    var arrowTransform = (StyleSheet.flatten(arrowStyle).transform || []).slice(0);
    arrowTransform.unshift({rotate: this.getArrowRotation(placement)});
    arrowStyle = [...arrowStyle, {transform: arrowTransform}];

    const invisibleStyle = (!this.props.isVisible && !this.state.isTransitioning) ? {width: 0, height: 0, overflow: 'hidden'} : {};

    return (
      <TouchableWithoutFeedback onPress={e => {
        if (!this.state.isTransitioning) {
          this.props.onClose(e);
        }
      }}>
        <View style={[styles.container, contentSizeAvailable && styles.containerVisible, invisibleStyle ]}>
          <Animated.View style={[styles.background, ...extendedStyles.background]}/>
          <Animated.View style={[styles.popover, {
            top: popoverOrigin.y,
            left: popoverOrigin.x,
            }, ...extendedStyles.popover]}>
            <Animated.View style={arrowStyle}/>
            <Animated.View ref='content' onLayout={this.measureContent} style={[invisibleStyle, contentStyle]}>
              {this.props.children}
            </Animated.View>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    );
  }
});


var styles = {
  container: {
    opacity: 0,
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  containerVisible: {
    opacity: 1,
  },
  background: {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  popover: {
    position: 'absolute',
  },
  content: {
    borderRadius: 3,
    padding: 6,
    backgroundColor: '#fff',
  },
  arrow: {
    position: 'absolute',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
};

module.exports = Popover;
