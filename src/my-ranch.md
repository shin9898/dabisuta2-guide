---
layout: layouts/base.njk
title: 自分の牧場の実例
description: オーナー本人の馬・スクリーンショット証拠付き（準備中）
updated: 2026-10-26
permalink: /my-ranch/
---

[[toc]]

## このページについて

<span class="label label-unknown">未確認</span>（事例・スクリーンショットは未掲載）

自分の牧場で育てた馬の配合・戦績・評価ラベルを、**ゲーム内スクリーンショット**を一次ソースとして掲載する予定のセクションです。他人の画像は使いません。

## 掲載予定の事例

<div class="placeholder-box">
  <p><strong>現在、事例は0件です。</strong></p>
  <p>スクリーンショットと短いキャプションを用意次第、ここにカード形式で追加します（データ: <code>src/_data/my_ranch.json</code>）。</p>
</div>

## 事例一覧

{% if my_ranch.事例 and my_ranch.事例.length %}
<ul>
{% for item in my_ranch.事例 %}
<li>{{ item.馬名 }} — {{ item.メモ }}</li>
{% endfor %}
</ul>
{% else %}
<p>（未登録）</p>
{% endif %}
