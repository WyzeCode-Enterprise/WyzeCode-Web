// app/api/html-mail/template.ts
export const htmlMailTemplate = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
<title></title>
<meta charset="UTF-8" />
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<!--[if !mso]>-->
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<!--<![endif]-->
<meta name="x-apple-disable-message-reformatting" content="" />
<meta content="target-densitydpi=device-dpi" name="viewport" />
<meta content="true" name="HandheldFriendly" />
<meta content="width=device-width" name="viewport" />
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no" />
<style type="text/css">
table {
border-collapse: separate;
table-layout: fixed;
mso-table-lspace: 0pt;
mso-table-rspace: 0pt
}
table td {
border-collapse: collapse
}
.ExternalClass {
width: 100%
}
.ExternalClass,
.ExternalClass p,
.ExternalClass span,
.ExternalClass font,
.ExternalClass td,
.ExternalClass div {
line-height: 100%
}
body, a, li, p, h1, h2, h3 {
-ms-text-size-adjust: 100%;
-webkit-text-size-adjust: 100%;
}
html {
-webkit-text-size-adjust: none !important
}
body {
min-width: 100%;
Margin: 0px;
padding: 0px;
}
body, #innerTable {
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale
}
#innerTable img+div {
display: none;
display: none !important
}
img {
Margin: 0;
padding: 0;
-ms-interpolation-mode: bicubic
}
h1, h2, h3, p, a {
line-height: inherit;
overflow-wrap: normal;
white-space: normal;
word-break: break-word
}
a {
text-decoration: none
}
h1, h2, h3, p {
min-width: 100%!important;
width: 100%!important;
max-width: 100%!important;
display: inline-block!important;
border: 0;
padding: 0;
margin: 0
}
a[x-apple-data-detectors] {
color: inherit !important;
text-decoration: none !important;
font-size: inherit !important;
font-family: inherit !important;
font-weight: inherit !important;
line-height: inherit !important
}
u + #body a {
color: inherit;
text-decoration: none;
font-size: inherit;
font-family: inherit;
font-weight: inherit;
line-height: inherit;
}
a[href^="mailto"],
a[href^="tel"],
a[href^="sms"] {
color: inherit;
text-decoration: none
}
/* <CHANGE> Estilo para o box do OTP usando div ao invés de tabela */
.otp-box {
background-color: #F5F5F5;
border-radius: 10px;
padding: 30px;
margin: 30px auto;
max-width: 100%;
text-align: center;
box-sizing: border-box;
}
.otp-code {
font-family: Inter, BlinkMacSystemFont, Segoe UI, Helvetica Neue, Arial, sans-serif;
font-size: 28px;
font-weight: 700;
color: #333333;
letter-spacing: 2px;
margin: 0;
}
</style>
<style type="text/css">
@media (min-width: 481px) {
.hd { display: none!important }
}
</style>
<style type="text/css">
@media (max-width: 480px) {
/* Remove espaçamento superior e inferior em mobile */
.t76,.t81{mso-line-height-alt:0px!important;line-height:0!important;display:none!important}
/* Ajusta padding do container principal */
.t77{padding:20px!important;border-radius:0!important}
/* Ajusta largura máxima dos containers */
.t73,.t75{max-width:100%!important}
/* Ajusta largura dos containers de conteúdo */
.t79{width:100%!important}
.t10,.t16,.t74{width:100%!important}
/* Reduz espaçamento entre elementos */
.t5{mso-line-height-alt:24px!important;line-height:24px!important}
.t12{mso-line-height-alt:12px!important;line-height:12px!important}
/* Ajusta tamanho da fonte do título */
.t7{font-size:20px!important;line-height:26px!important}
/* Ajusta tamanho da fonte do texto */
.t13{font-size:14px!important;line-height:22px!important}
/* Ajusta footer */
.t71{font-size:12px!important;line-height:18px!important}
/* Ajusta logo */
.t3{width:80px!important}
/* <CHANGE> Estilo responsivo para o box do OTP em mobile */
.otp-box {
padding: 30px!important;
margin: 20px 0!important;
max-width: 100%!important;
}
.otp-code {
font-size: 24px!important;
letter-spacing: 1px!important;
}
}
</style>
<!--[if !mso]>-->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&amp;family=Inter+Tight:wght@500;600;700&amp;family=Open+Sans:wght@500&amp;display=swap" rel="stylesheet" type="text/css" />
<!--<![endif]-->
<!--[if mso]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
</head>
<body id="body" class="t84" style="min-width:100%;Margin:0px;padding:0px;background-color:#FFFFFF;"><div class="t83" style="background-color:#FFFFFF;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td class="t82" style="font-size:0;line-height:0;mso-line-height-rule:exactly;background-color:#FFFFFF;" valign="top" align="center">
<!--[if mso]>
<v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false">
<v:fill color="#FFFFFF"/>
</v:background>
<![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" id="innerTable"><tr><td><div class="t76" style="mso-line-height-rule:exactly;mso-line-height-alt:50px;line-height:50px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t80" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="600" class="t79" style="width:600px;">
<table class="t78" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t77" style="overflow:hidden;background-color:#FFFFFF;padding:44px 42px 32px 42px;border-radius:3px 3px 3px 3px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100% !important;"><tr><td align="center">
<table class="t4" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="96" class="t3" style="width:96px;">
<table class="t2" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t1"><div style="font-size:0px;"><img
  src="https://wyzebank.com/lg_files_wb/png_files/icon_green_black.png"
  width="96"
  height="96"
  alt="Wyze Bank"
  style="display:block;border:0;width:96px;height:96px;background:#fff;"
/></div></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t5" style="mso-line-height-rule:exactly;mso-line-height-alt:42px;line-height:42px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t11" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="516" class="t10" style="width:1861px;">
<table class="t9" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t8" style="overflow:hidden;padding:0 0 18px 0;border-radius:10px 10px 10px 10px;"><h1 class="t7" style="margin:0;Margin:0;font-family:Inter,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:28px;font-weight:700;font-style:normal;font-size:24px;text-decoration:none;text-transform:none;letter-spacing:-1px;direction:ltr;color:#141414;text-align:center;mso-line-height-rule:exactly;mso-text-raise:1px;">Seu código de verificação é: <span class="t6" style="margin:0;Margin:0;color:#26FF59;mso-line-height-rule:exactly;background-color:#FFFFFF;">{{OTP}}</span></h1></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t12" style="mso-line-height-rule:exactly;mso-line-height-alt:18px;line-height:18px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr><tr><td align="center">
<table class="t17" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;"><tr><td width="516" class="t16" style="width:600px;">
<table class="t15" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td class="t14"><p class="t13" style="margin:0;Margin:0;font-family:Inter,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:25px;font-weight:400;font-style:normal;font-size:14px;text-decoration:none;text-transform:none;letter-spacing:-0.1px;direction:ltr;color:#141414;text-align:center;mso-line-height-rule:exactly;mso-text-raise:3px;">Olá, {{NOME}} Copie seu token de autenticação, retorne a página de login para realizar a validação e assim prosseguir para criação de sua conta Wyze Bank LTDA.</p></td></tr></table>
</td></tr></table>
</td></tr><tr><td align="center">
<!-- <CHANGE> Box do OTP usando div ao invés de tabela complexa -->
<div class="otp-box">
<p class="otp-code">{{OTP}}</p>
</div>
</td></tr><tr><td align="center">
<!-- <CHANGE> Linha separadora antes do footer -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
<tr><td style="border-top: 1px solid #EDEDED;"></td></tr>
</table>
</td></tr><tr><td align="center">
<table class="t75" role="presentation" cellpadding="0" cellspacing="0" style="Margin-left:auto;Margin-right:auto;max-width:516px;"><tr><td class="t74" style="width:auto;">
<table class="t73" role="presentation" cellpadding="0" cellspacing="0" style="width:auto;max-width:516px;"><tr><td class="t72" style="background-color:#FFFFFF;text-align:center;line-height:20px;mso-line-height-rule:exactly;mso-text-raise:2px;"><span class="t71" style="display:block;margin:0;Margin:0;font-family:Open Sans,BlinkMacSystemFont,Segoe UI,Helvetica Neue,Arial,sans-serif;line-height:20px;font-weight:500;font-style:normal;font-size:14px;text-decoration:none;direction:ltr;color:#DBDBDB;text-align:center;mso-line-height-rule:exactly;mso-text-raise:2px;">Todos Direitos Reservados. 2025 ® Wyze Bank LTDA.&nbsp;</span></td></tr></table>
</td></tr></table>
</td></tr></table></td></tr></table>
</td></tr></table>
</td></tr><tr><td><div class="t81" style="mso-line-height-rule:exactly;mso-line-height-alt:50px;line-height:50px;font-size:1px;display:block;">&nbsp;&nbsp;</div></td></tr></table></td></tr></table></div><div class="gmail-fix" style="display: none; white-space: nowrap; font: 15px courier; line-height: 0;">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</div></body>
</html>
`;
