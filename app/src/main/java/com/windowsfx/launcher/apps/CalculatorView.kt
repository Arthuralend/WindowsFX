package com.windowsfx.launcher.apps

import android.annotation.SuppressLint
import android.view.Gravity
import android.widget.GridLayout
import android.widget.LinearLayout
import com.windowsfx.launcher.DesktopActivity
import com.windowsfx.launcher.R
import com.windowsfx.launcher.core.Th
import com.windowsfx.launcher.core.W
import com.windowsfx.launcher.core.dp
import com.windowsfx.launcher.core.dpf
import com.windowsfx.launcher.core.pressable
import com.windowsfx.launcher.core.rounded
import java.math.BigDecimal
import java.math.MathContext

/** Standard calculator. */
@SuppressLint("ViewConstructor")
class CalculatorView(private val act: DesktopActivity) : LinearLayout(act) {

    private var expr = ""
    private var justEvaluated = false
    private val exprView = W.text(act, "", 14f, Th.p.textDim)
    private val resultView = W.text(act, "0", 38f, Th.p.text, bold = true)

    init {
        orientation = VERTICAL
        setBackgroundColor(Th.p.surface)
        setPadding(dp(8), dp(8), dp(8), dp(8))
        exprView.gravity = Gravity.END
        resultView.gravity = Gravity.END
        addView(exprView, W.lp(W.MATCH, W.WRAP).apply { setMargins(dp(8), dp(12), dp(8), 0) })
        addView(resultView, W.lp(W.MATCH, W.WRAP).apply { setMargins(dp(8), dp(6), dp(8), dp(12)) })

        val grid = GridLayout(act).apply {
            columnCount = 4
            rowCount = 5
        }
        val keys = listOf("%", "CE", "C", "⌫", "7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "±", "0", ",", "+")
        for ((i, k) in keys.withIndex()) {
            val op = k in setOf("÷", "×", "−", "+", "%", "CE", "C", "⌫", "±")
            val b = W.text(act, k, 18f, Th.p.text, bold = !op).apply {
                gravity = Gravity.CENTER
                background = pressable(rounded(if (op) Th.p.surface3 else Th.p.surface2, dpf(6)), dpf(6))
                isClickable = true
                setOnClickListener { press(k) }
            }
            val lp = GridLayout.LayoutParams(GridLayout.spec(i / 4, 1f), GridLayout.spec(i % 4, 1f)).apply {
                width = 0
                height = 0
                setMargins(dp(2), dp(2), dp(2), dp(2))
            }
            grid.addView(b, lp)
        }
        addView(grid, W.lp(W.MATCH, 0, 1f))
        val eq = W.text(act, "=", 22f, android.graphics.Color.WHITE, bold = true).apply {
            gravity = Gravity.CENTER
            background = pressable(rounded(Th.p.accent, dpf(6)), dpf(6))
            isClickable = true
            setOnClickListener { press("=") }
        }
        addView(eq, W.lp(W.MATCH, dp(54)).apply { setMargins(dp(2), dp(4), dp(2), dp(2)) })
        isFocusable = true
    }

    private fun press(k: String) {
        when (k) {
            "C" -> { expr = ""; resultView.text = "0" }
            "CE" -> { expr = expr.trimEnd { it.isDigit() || it == '.' } }
            "⌫" -> if (expr.isNotEmpty()) expr = expr.dropLast(1)
            "=" -> {
                val r = eval(expr)
                exprView.text = pretty(expr) + " ="
                if (r != null) {
                    expr = r
                    resultView.text = pretty(r)
                } else resultView.text = act.getString(R.string.calc_error)
                justEvaluated = true
                return
            }
            "±" -> {
                val num = expr.takeLastWhile { it.isDigit() || it == '.' }
                val head = expr.dropLast(num.length)
                expr = if (head.endsWith("(-")) head.dropLast(2) + num else "$head(-$num"
            }
            "÷", "×", "−", "+", "%" -> {
                val c = when (k) { "÷" -> "/"; "×" -> "*"; "−" -> "-"; else -> k }
                if (expr.isEmpty() && c != "-") expr = "0"
                if (expr.isNotEmpty() && expr.last() in "+-*/%") expr = expr.dropLast(1)
                expr += c
            }
            "," -> {
                if (justEvaluated) expr = ""
                val num = expr.takeLastWhile { it.isDigit() || it == '.' }
                if (!num.contains('.')) expr += if (num.isEmpty()) "0." else "."
            }
            else -> {
                if (justEvaluated) expr = ""
                expr += k
            }
        }
        justEvaluated = false
        exprView.text = ""
        resultView.text = if (expr.isEmpty()) "0" else pretty(expr)
    }

    private fun pretty(s: String) = s.replace("*", "×").replace("/", "÷").replace("-", "−").replace('.', ',')

    // --- tiny recursive-descent evaluator: + - * / % and parentheses
    private var pos = 0
    private var src = ""

    private fun eval(s: String): String? = try {
        src = s.trimEnd('+', '-', '*', '/') + ")".repeat((s.count { it == '(' } - s.count { it == ')' }).coerceAtLeast(0))
        pos = 0
        val v = parseExpr()
        if (pos != src.length) null
        else v.round(MathContext(14)).stripTrailingZeros().let {
            if (it.scale() < 0) it.setScale(0) else it
        }.toPlainString()
    } catch (_: Exception) {
        null
    }

    private fun parseExpr(): BigDecimal {
        var v = parseTerm()
        while (pos < src.length && (src[pos] == '+' || src[pos] == '-')) {
            val op = src[pos++]
            val r = parseTerm()
            v = if (op == '+') v.add(r) else v.subtract(r)
        }
        return v
    }

    private fun parseTerm(): BigDecimal {
        var v = parseFactor()
        while (pos < src.length && (src[pos] == '*' || src[pos] == '/' || src[pos] == '%')) {
            val op = src[pos++]
            if (op == '%' && (pos >= src.length || src[pos] in "+-*/)")) {
                v = v.divide(BigDecimal(100), MathContext.DECIMAL64)
                continue
            }
            val r = parseFactor()
            v = when (op) {
                '*' -> v.multiply(r)
                '/' -> v.divide(r, MathContext.DECIMAL64)
                else -> v.remainder(r)
            }
        }
        return v
    }

    private fun parseFactor(): BigDecimal {
        if (pos < src.length && src[pos] == '-') {
            pos++
            return parseFactor().negate()
        }
        if (pos < src.length && src[pos] == '(') {
            pos++
            val v = parseExpr()
            if (pos < src.length && src[pos] == ')') pos++
            return v
        }
        val start = pos
        while (pos < src.length && (src[pos].isDigit() || src[pos] == '.')) pos++
        return BigDecimal(src.substring(start, pos))
    }
}
