#import "@preview/example:0.1.0": *

#set page(paper: "a4")
#set text(font: "New Computer Modern", size: 11pt)

= Introduction <intro>

This is a sample Typst document with math $x + y = z$ and a list:

- First item
- Second item
+ Numbered style item

== Methods <methods>

#let title = "Hello"
#let data = (
  name: "Ada",
  age: 36,
  active: true,
)

#figure(
  caption: [A figure],
)[
  Content block with "quoted string".
]

See @intro and @methods for details.

#set page(margin: 2cm)
