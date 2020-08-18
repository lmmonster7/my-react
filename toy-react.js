
const RENDER_TO_DOM = Symbol("render to dom")

// 这三个包装类的共同特性，都是自定义dom对象，读取其root属性返回真实dom
class ElementWrapper {
  constructor(type) {
    this.root = document.createElement(type)
  }
  // 原生标签的属性直接当成原生属性进行添加
  setAttribute(name, value) {
    if (name.match(/^on([\s\S]+)$/)) {
      this.root.addEventListener(RegExp.$1.replace(/^[\s\S]/, c => c.toLowerCase()), value)
    } else {
      if (name === 'className') {
        this.root.setAttribute('class', value)
      } else {
        this.root.setAttribute(name, value)
      }
    }
  }
  // 原生标签的子标签直接使用原生appendChild添加
  appendChild(component) {
    let range = document.createRange()
    range.setStart(this.root, this.root.childNodes.length)
    range.setEnd(this.root, this.root.childNodes.length)
    component[RENDER_TO_DOM](range)
  }
  [RENDER_TO_DOM](range) {
    range.deleteContents()
    range.insertNode(this.root)
  }
}

class TextWrapper {
  constructor(content) {
    this.root = document.createTextNode(content)
  }
  [RENDER_TO_DOM](range) {
    range.deleteContents()
    range.insertNode(this.root)
  }
}

export class Component {
  constructor(content) {
    this.props = Object.create(null)
    this.children = []
    this._root = null
  }
  // 组件的属性处理，对于组件，属性是参数
  setAttribute(name, value) {
    this.props[name] = value
  }
  // 组件的子标签处理，对于组件，其子标签和原生子标签不同，不是简单的直接插入，而是需要指定位置
  appendChild(component) {
    this.children.push(component)
  }
  [RENDER_TO_DOM](range) {
    this._range = range
    this.render()[RENDER_TO_DOM](range)
  }
  rerender() {
    let oldRange = this._range
    
    let range = document.createRange()
    range.setStart(oldRange.startContainer, oldRange.startOffset)
    range.setEnd(oldRange.startContainer, oldRange.startOffset)
    this[RENDER_TO_DOM](range)

    oldRange.setStart(range.endContainer, range.endOffset)
    oldRange.deleteContents()
  }
  setState(newState) {
    if (this.state === null || typeof this.state !== 'object') {
      this.state = newState
      this.rerender()
      return
    }
    let merge =  (oldState, newState) => {
      for (let p in newState) {
        if (oldState[p] === null || typeof oldState[p] !== 'object') {
          oldState[p] = newState[p]
        } else {
          merge(oldState[p], newState[p])
        }
      }
    }
    merge(this.state, newState)
    this.rerender()
  }
}

// createElement的作用是返回解释好的自定义dom对象，其root属性就是我们需要的真实dom，有了真实dom对象，就可以直接挂载让浏览器进行dom渲染
// @babel/plugin-transform-react-jsx 会将js里面的dom标签转化为createElement的函数调用
// 其中 children 数组里面的子元素是是对子标签进行createElement
export function createElement(type, attributes, ...children) {
  // 这个是自定义的dom对象而非真实dom，其root是真实dom对象
  let e
  // 第一个参数
  // 第一层标签处理
  // 当标签为原生标签，eg div span等，createElement的type会传入该标签的字符串
  if (typeof type === 'string') {
    e = new ElementWrapper(type)
  } else {
  // 当标签是非原生标签，即组件的时候，传入的是一个类，这个类需要提前定义好，这个时候需要进行new
    e = new type
  }
  // 第二个参数的处理
  // 第二个参数是一个对象，用于存放给标签设定的属性
  for (let p in attributes) {
    e.setAttribute(p, attributes[p])
  }
  // 第三个参数处理
  // 该标签下面的子标签，是一个数组
  let insertChildren = (children) => {
    for (let child of children) {
      if (typeof child === 'string') {
        child = new TextWrapper(child)
      }
      if (child === null) {
        continue
      }
      // 处理传入的是一个数组的情况，因为 { this.children } this.children指向的是一个数组
      if ((typeof child === 'object') && (child instanceof Array)) {
        insertChildren(child)
      } else {
        e.appendChild(child)
      }
    }
  }
  insertChildren(children)
  // 返回自定义dom对象
  return e
}

// 该函数的功能是将dom元素挂载到html上
export function render(component, parentElement) {
  let range = document.createRange()
  range.setStart(parentElement, 0)
  range.setEnd(parentElement, parentElement.childNodes.length)
  range.deleteContents()
  component[RENDER_TO_DOM](range)
}
