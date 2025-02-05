class VerificationGen {
    generateCode() {
        return Math.floor(100000 + Math.random() * 900000);
    }
    generateSecret() {
        return Math.random().toString(36).substring(2, 15);
    }
}

export { VerificationGen };