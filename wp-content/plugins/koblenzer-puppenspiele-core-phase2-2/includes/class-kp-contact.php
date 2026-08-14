<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class KP_Contact {
    const CONTACT_EMAIL = 'koblenzer-puppenspiele@gmx.de';

    public static function init() {
        add_shortcode( 'kp_contact', array( __CLASS__, 'shortcode' ) );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
    }

    public static function enqueue_assets() {
        if ( is_page( 'kontakt' ) ) {
            wp_enqueue_style( 'kp-contact', KP_CORE_URL . 'assets/contact.css', array(), KP_CORE_VERSION );
        }
    }

    private static function recipient() {
        return sanitize_email( apply_filters( 'kp_contact_email', self::CONTACT_EMAIL ) );
    }

    private static function field( $key ) {
        return isset( $_POST[ $key ] ) ? sanitize_text_field( wp_unslash( $_POST[ $key ] ) ) : '';
    }

    private static function textarea( $key ) {
        return isset( $_POST[ $key ] ) ? sanitize_textarea_field( wp_unslash( $_POST[ $key ] ) ) : '';
    }

    private static function handle_submission() {
        $result = array( 'status' => '', 'message' => '' );
        if ( 'POST' !== strtoupper( $_SERVER['REQUEST_METHOD'] ?? '' ) || empty( $_POST['kp_contact_submit'] ) ) {
            return $result;
        }

        if ( ! isset( $_POST['kp_contact_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['kp_contact_nonce'] ) ), 'kp_contact_submit' ) ) {
            return array( 'status' => 'error', 'message' => 'Die Anfrage konnte aus Sicherheitsgründen nicht geprüft werden. Bitte laden Sie die Seite neu und versuchen Sie es erneut.' );
        }

        if ( ! empty( $_POST['website'] ) ) {
            return array( 'status' => 'success', 'message' => 'Vielen Dank. Ihre Anfrage wurde übermittelt.' );
        }

        $name         = self::field( 'name' );
        $email        = sanitize_email( isset( $_POST['email'] ) ? wp_unslash( $_POST['email'] ) : '' );
        $phone        = self::field( 'phone' );
        $organisation = self::field( 'organisation' );
        $place        = self::field( 'place' );
        $occasion     = self::field( 'occasion' );
        $dates        = self::field( 'dates' );
        $audience     = self::field( 'audience' );
        $piece        = self::field( 'piece' );
        $message      = self::textarea( 'message' );
        $privacy      = ! empty( $_POST['privacy'] );

        if ( '' === $name || ! is_email( $email ) || '' === $message || ! $privacy ) {
            return array( 'status' => 'error', 'message' => 'Bitte füllen Sie Name, eine gültige E-Mail-Adresse und Ihre Nachricht aus und bestätigen Sie den Datenschutzhinweis.' );
        }

        $recipient = self::recipient();
        if ( ! is_email( $recipient ) ) {
            return array( 'status' => 'error', 'message' => 'Die Kontaktadresse ist momentan nicht korrekt hinterlegt. Bitte versuchen Sie es später erneut.' );
        }

        $subject = sprintf( 'Website-Anfrage von %s', $name );
        $body = "Neue Anfrage über koblenzer-puppenspiele.de\n\n";
        $body .= "Name: {$name}\n";
        $body .= "E-Mail: {$email}\n";
        if ( $phone )        { $body .= "Telefon: {$phone}\n"; }
        if ( $organisation ) { $body .= "Einrichtung / Organisation: {$organisation}\n"; }
        if ( $place )        { $body .= "Spielort: {$place}\n"; }
        if ( $occasion )     { $body .= "Anlass: {$occasion}\n"; }
        if ( $dates )        { $body .= "Wunschtermine / Zeitraum: {$dates}\n"; }
        if ( $audience )     { $body .= "Publikum / Altersgruppe: {$audience}\n"; }
        if ( $piece )        { $body .= "Wunschstück: {$piece}\n"; }
        $body .= "\nNachricht:\n{$message}\n";
        $body .= "\nDatenschutzhinweis im Formular bestätigt: ja\n";

        $headers = array( 'Reply-To: ' . $name . ' <' . $email . '>' );
        $sent = wp_mail( $recipient, $subject, $body, $headers );

        if ( ! $sent ) {
            return array( 'status' => 'error', 'message' => 'Die Nachricht konnte gerade nicht versendet werden. Bitte nutzen Sie alternativ die angezeigte E-Mail-Adresse.' );
        }

        return array( 'status' => 'success', 'message' => 'Vielen Dank! Ihre Anfrage wurde versendet. Wir melden uns so bald wie möglich zurück.' );
    }

    public static function shortcode() {
        $result = self::handle_submission();
        $email  = self::recipient();
        $values = array(
            'name'         => self::field( 'name' ),
            'email'        => isset( $_POST['email'] ) ? sanitize_email( wp_unslash( $_POST['email'] ) ) : '',
            'phone'        => self::field( 'phone' ),
            'organisation' => self::field( 'organisation' ),
            'place'        => self::field( 'place' ),
            'occasion'     => self::field( 'occasion' ),
            'dates'        => self::field( 'dates' ),
            'audience'     => self::field( 'audience' ),
            'piece'        => self::field( 'piece' ),
            'message'      => self::textarea( 'message' ),
        );

        if ( 'success' === $result['status'] ) {
            foreach ( $values as $key => $value ) { $values[ $key ] = ''; }
        }

        ob_start(); ?>
        <section class="kp-finish kp-contact-page">
            <p class="kp-finish-kicker">Kontakt</p>
            <h2>Vorhang auf für Ihre Anfrage</h2>
            <p class="kp-finish-lead">Ob Gastspiel, Kita, Schule, Kulturveranstaltung oder eine allgemeine Frage: Schreiben Sie uns direkt hier. Für Buchungsanfragen helfen mehrere Wunschtermine, Spielort und ungefähre Publikumsgröße.</p>

            <?php if ( $result['status'] ) : ?>
                <div class="kp-contact-notice kp-contact-notice-<?php echo esc_attr( $result['status'] ); ?>" role="status"><?php echo esc_html( $result['message'] ); ?></div>
            <?php endif; ?>

            <div class="kp-contact-layout">
                <article class="kp-finish-card kp-contact-direct">
                    <span class="kp-finish-tag">Direkter Kontakt</span>
                    <h3>Lieber per E-Mail?</h3>
                    <p><a href="mailto:<?php echo esc_attr( $email ); ?>"><?php echo esc_html( $email ); ?></a></p>
                    <p>Für eine schnelle Einschätzung sind Wunschstück, zwei bis drei mögliche Termine, Spielort, Publikumsgröße und Altersgruppe besonders hilfreich.</p>
                    <a href="/jetzt-buchen/">Hinweise zur Buchung →</a>
                </article>

                <form class="kp-contact-form" method="post" action="<?php echo esc_url( get_permalink() ); ?>">
                    <?php wp_nonce_field( 'kp_contact_submit', 'kp_contact_nonce' ); ?>
                    <input type="hidden" name="kp_contact_submit" value="1">
                    <div class="kp-contact-hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>

                    <div class="kp-contact-fields kp-contact-fields-2">
                        <label>Name <span aria-hidden="true">*</span><input type="text" name="name" value="<?php echo esc_attr( $values['name'] ); ?>" autocomplete="name" required></label>
                        <label>E-Mail <span aria-hidden="true">*</span><input type="email" name="email" value="<?php echo esc_attr( $values['email'] ); ?>" autocomplete="email" required></label>
                        <label>Telefon <span class="kp-contact-optional">optional</span><input type="tel" name="phone" value="<?php echo esc_attr( $values['phone'] ); ?>" autocomplete="tel"></label>
                        <label>Einrichtung / Organisation <span class="kp-contact-optional">optional</span><input type="text" name="organisation" value="<?php echo esc_attr( $values['organisation'] ); ?>" autocomplete="organization"></label>
                        <label>Spielort <span class="kp-contact-optional">optional</span><input type="text" name="place" value="<?php echo esc_attr( $values['place'] ); ?>"></label>
                        <label>Anlass <span class="kp-contact-optional">optional</span><input type="text" name="occasion" value="<?php echo esc_attr( $values['occasion'] ); ?>" placeholder="z. B. Kita, Stadtfest, Kulturhaus"></label>
                        <label>Wunschtermine / Zeitraum <span class="kp-contact-optional">optional</span><input type="text" name="dates" value="<?php echo esc_attr( $values['dates'] ); ?>" placeholder="Am besten 2–3 Möglichkeiten"></label>
                        <label>Publikum / Altersgruppe <span class="kp-contact-optional">optional</span><input type="text" name="audience" value="<?php echo esc_attr( $values['audience'] ); ?>" placeholder="z. B. 60 Kinder, 4–6 Jahre"></label>
                    </div>
                    <label>Wunschstück <span class="kp-contact-optional">optional</span><input type="text" name="piece" value="<?php echo esc_attr( $values['piece'] ); ?>"></label>
                    <label>Ihre Nachricht <span aria-hidden="true">*</span><textarea name="message" rows="6" required><?php echo esc_textarea( $values['message'] ); ?></textarea></label>
                    <label class="kp-contact-consent"><input type="checkbox" name="privacy" value="1" required> <span>Ich habe die <a href="/datenschutz/">Datenschutzerklärung</a> gelesen und bin mit der Verarbeitung meiner Angaben zur Bearbeitung der Anfrage einverstanden. <span aria-hidden="true">*</span></span></label>
                    <p class="kp-contact-required">* Pflichtfelder · Die Angaben werden durch dieses Formular nicht in WordPress gespeichert.</p>
                    <button class="kp-finish-button kp-contact-submit" type="submit">Anfrage senden</button>
                </form>
            </div>
        </section>
        <?php return ob_get_clean();
    }
}
